import { describe, it, expect } from 'vitest';
import { detect } from '../src/engine/engine';
import { detectPersonRu } from '../src/engine/person_ru';
import { EngineConfig } from '../src/engine/types';

const defaultConfig: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'US_SSN', 'IP_ADDRESS', 'PERSON', 'SECRET'],
  minConfidence: 'medium',
  language: 'auto'
};

describe('Engine Detection', () => {
  it('should detect email and phone', () => {
    const text = 'Contact me at test@example.com or +7 (999) 123-45-67';
    const results = detect(text, defaultConfig);
    expect(results.some(d => d.type === 'EMAIL')).toBe(true);
    expect(results.some(d => d.type === 'PHONE')).toBe(true);
  });

  it('should detect RU_INN with context', () => {
    const text = 'Мой ИНН 7712345671';
    const results = detect(text, defaultConfig);
    const inn = results.find(d => d.type === 'RU_INN');
    expect(inn).toBeDefined();
    expect(inn?.confidence).toBe('high');
  });

  it('should detect Russian Person (FIO)', () => {
    const text = 'Иванов Иван Иванович пришел на встречу.';
    const results = detectPersonRu(text);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.value === 'Иванов Иван Иванович')).toBe(true);
  });

  it('should handle overlapping spans (longer wins)', () => {
    const text = 'ИНН 7712345671'; // INN is 10 digits, but could be part of something else
    const results = detect(text, defaultConfig);
    // Should not have multiple detections for the same digits
    expect(results.length).toBe(1);
  });

  it('should detect secrets', () => {
    const text = 'API_KEY: "ak_test_51MzBy8L2QW9asdfghjkl12345"';
    const results = detect(text, defaultConfig);
    expect(results.some(d => d.type === 'SECRET_KV')).toBe(true);
  });

  it('should not detect secrets when disabled', () => {
    const text = 'API_KEY: "ak_test_51MzBy8L2QW9asdfghjkl12345"';
    const results = detect(text, { ...defaultConfig, enabledTypes: ['EMAIL'] });
    expect(results.some(d => d.type.startsWith('SECRET_'))).toBe(false);
  });

  it('should detect normalized candidates and keep original spans', () => {
    const text = 'Card: ４１１１１１１１１１１１１１１１';
    const results = detect(text, defaultConfig);
    const card = results.find(d => d.type === 'CARD');
    expect(card?.value).toBe('４１１１１１１１１１１１１１１１');
    expect(card?.start).toBe(6);
  });
});

describe('Homoglyph folding', () => {
  it('should detect email with Cyrillic homoglyphs and keep the original value', () => {
    const text = 'почта: test@exаmple.com'; // Cyrillic "а" in domain
    const results = detect(text, defaultConfig);
    const email = results.find(d => d.type === 'EMAIL');
    expect(email).toBeDefined();
    expect(email?.value).toBe('test@exаmple.com');
  });

  it('should detect AWS key typed with Cyrillic lookalikes', () => {
    const text = 'ключ АКIAIOSFODNN7EXAMPLE утёк'; // Cyrillic А and К
    const results = detect(text, defaultConfig);
    expect(results.some(d => d.type === 'SECRET_AWS')).toBe(true);
  });
});

describe('Phone formats', () => {
  it('should detect RU phones with space and hyphen separators', () => {
    for (const text of ['звони 8 916 123 45 67', 'тел 8-916-123-45-67', '8(916)1234567', '+7 999 123 45 67']) {
      const results = detect(text, defaultConfig);
      expect(results.some(d => d.type === 'PHONE' && d.confidence === 'high'), text).toBe(true);
    }
  });

  it('should downgrade bare 11-digit numbers to medium', () => {
    const results = detect('артикул 81234567890 на складе', defaultConfig);
    const phone = results.find(d => d.type === 'PHONE');
    expect(phone?.confidence).toBe('medium');
  });

  it('should not extract phones from inside longer digit runs', () => {
    const results = detect('код 12345678901234567890 тут', defaultConfig);
    expect(results.some(d => d.type === 'PHONE')).toBe(false);
  });
});

describe('Context-dependent confidence', () => {
  it('CARD: grouped or contextual is high, bare 16-digit is medium, bare 13-digit is dropped', () => {
    expect(detect('карта 4123456789011', defaultConfig).find(d => d.type === 'CARD')?.confidence).toBe('high');
    expect(detect('перевод: 4111 1111 1111 1111', defaultConfig).find(d => d.type === 'CARD')?.confidence).toBe('high');
    expect(detect('число 2200123456789019 тут', defaultConfig).find(d => d.type === 'CARD')?.confidence).toBe('medium');
    expect(detect('номер заказа 4123456789011', defaultConfig).some(d => d.type === 'CARD')).toBe(false);
  });

  it('RU_INN: bare 10-digit is dropped by default, bare 12-digit stays medium', () => {
    expect(detect('заказ 7712345671 оформлен', defaultConfig).some(d => d.type === 'RU_INN')).toBe(false);
    expect(detect('номер 771234567859 в реестре', defaultConfig).find(d => d.type === 'RU_INN')?.confidence).toBe('medium');
  });

  it('RU_OGRN: requires context for high confidence', () => {
    expect(detect('ОГРН 1207700012343', defaultConfig).find(d => d.type === 'RU_OGRN')?.confidence).toBe('high');
    expect(detect('трек 1207700012343 отправлен', defaultConfig).some(d => d.type === 'RU_OGRN')).toBe(false);
  });
});

describe('US_SSN', () => {
  it('should detect a well-formed SSN', () => {
    const results = detect('SSN: 123-45-6789', defaultConfig);
    expect(results.some(d => d.type === 'US_SSN' && d.confidence === 'high')).toBe(true);
  });

  it('should reject invalid ranges', () => {
    for (const ssn of ['000-12-3456', '666-12-3456', '901-12-3456', '123-00-4567', '123-45-0000']) {
      const results = detect(`SSN: ${ssn}`, defaultConfig);
      expect(results.some(d => d.type === 'US_SSN'), ssn).toBe(false);
    }
  });
});

describe('DATE_OF_BIRTH (opt-in)', () => {
  it('is off unless explicitly enabled', () => {
    const results = detect('дата рождения 01.02.1985', defaultConfig);
    expect(results.some(d => d.type === 'DATE_OF_BIRTH')).toBe(false);
  });

  it('detects dates when enabled, with birth context boosting confidence', () => {
    const config = { ...defaultConfig, enabledTypes: [...defaultConfig.enabledTypes, 'DATE_OF_BIRTH'] };
    expect(detect('дата рождения 01.02.1985', config).find(d => d.type === 'DATE_OF_BIRTH')?.confidence).toBe('high');
    expect(detect('встреча 15.03.2024 в офисе', config).find(d => d.type === 'DATE_OF_BIRTH')?.confidence).toBe('medium');
  });
});

describe('Entropy secrets', () => {
  it('should flag bare hex keys (hex-adjusted threshold)', () => {
    const results = detect('ключ f47ac10b58cc4372a5670e02b2c3d479 без префикса', defaultConfig);
    expect(results.some(d => d.type === 'SECRET_ENTROPY')).toBe(true);
  });

  it('should skip hex explicitly labeled as commit/hash', () => {
    const results = detect('commit a94a8fe5ccb19ba61c4c0873d391e987982fbbd3', defaultConfig);
    expect(results.some(d => d.type.startsWith('SECRET_'))).toBe(false);
  });
});

describe('Person declension', () => {
  it('should detect full FIO in oblique cases', () => {
    const results = detect('Выдано Иванову Ивану Ивановичу по заявлению', defaultConfig);
    expect(results.some(d => d.type === 'PERSON' && d.value === 'Иванову Ивану Ивановичу')).toBe(true);
  });

  it('should detect declined name + surname pairs', () => {
    expect(detect('Заявление от Марии Петровой поступило вчера', defaultConfig)
      .some(d => d.type === 'PERSON' && d.value === 'Марии Петровой')).toBe(true);
    expect(detect('Доверенность на Сергея Кузнецова оформлена', defaultConfig)
      .some(d => d.type === 'PERSON' && d.value === 'Сергея Кузнецова')).toBe(true);
  });

  it('should detect diminutives with surnames', () => {
    const results = detect('Передай Саше Иванову привет', defaultConfig);
    expect(results.some(d => d.type === 'PERSON' && d.value === 'Саше Иванову')).toBe(true);
  });
});

describe('PERSON confidence filter', () => {
  it('EN capitalized pairs surface only at minConfidence low', () => {
    const text = 'The report was written by John Smith yesterday';
    const atMedium = detect(text, defaultConfig);
    expect(atMedium.some(d => d.type === 'PERSON')).toBe(false);
    const atLow = detect(text, { ...defaultConfig, minConfidence: 'low' });
    expect(atLow.some(d => d.type === 'PERSON' && d.value === 'John Smith')).toBe(true);
  });
});
