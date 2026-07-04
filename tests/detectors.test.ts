import { describe, it, expect } from 'vitest';
import { detect } from '../src/engine/engine';
import { detectPersonRu } from '../src/engine/person_ru';
import { validateBankAccount } from '../src/engine/checksums';
import { EngineConfig } from '../src/engine/types';

const defaultConfig: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_DRIVER_LICENSE', 'RU_OMS', 'RU_BIK', 'RU_BANK_ACCOUNT', 'RU_KPP', 'IBAN', 'US_SSN', 'US_EIN', 'US_DRIVER_LICENSE', 'US_MEDICARE', 'IP_ADDRESS', 'PERSON', 'SECRET'],
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

  it('should detect plain ASCII AWS key (runtime-assembled, scanner-safe source)', () => {
    const key = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
    const results = detect(`в логах найден ${key}`, defaultConfig);
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

describe('IPv6', () => {
  it('detects full and compressed IPv6 addresses', () => {
    for (const ip of ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', '2001:db8::1', 'fe80::1ff:fe23:4567:890a', '::1']) {
      const results = detect(`сервер ${ip} доступен`, defaultConfig);
      expect(results.some(d => d.type === 'IP_ADDRESS' && d.value === ip), ip).toBe(true);
    }
  });

  it('does not match MAC addresses or clock times', () => {
    expect(detect('MAC 01:23:45:67:89:ab устройства', defaultConfig).some(d => d.type === 'IP_ADDRESS')).toBe(false);
    expect(detect('время 12:34:56 по МСК', defaultConfig).some(d => d.type === 'IP_ADDRESS')).toBe(false);
  });
});

describe('RU_DRIVER_LICENSE', () => {
  it('detects a licence number only with driver-licence context', () => {
    expect(detect('в/у 12 34 567890 выдано ГИБДД', defaultConfig)
      .some(d => d.type === 'RU_DRIVER_LICENSE' && d.value === '12 34 567890')).toBe(true);
    expect(detect('водительское удостоверение 1234 567890', defaultConfig)
      .some(d => d.type === 'RU_DRIVER_LICENSE')).toBe(true);
  });

  it('does not fire on the same digits without context', () => {
    expect(detect('номер 12 34 567890 в накладной', defaultConfig)
      .some(d => d.type === 'RU_DRIVER_LICENSE')).toBe(false);
  });

  it('passport context yields passport, not driver licence', () => {
    const r = detect('паспорт 1234 567890 выдан', defaultConfig);
    expect(r.some(d => d.type === 'RU_PASSPORT')).toBe(true);
    expect(r.some(d => d.type === 'RU_DRIVER_LICENSE')).toBe(false);
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

describe('RU banking (B2B, context-cued)', () => {
  it('RU_BIK only with БИК context', () => {
    expect(detect('БИК 044525225 банка', defaultConfig).some(d => d.type === 'RU_BIK' && d.value === '044525225')).toBe(true);
    expect(detect('код 044525225 записан', defaultConfig).some(d => d.type === 'RU_BIK')).toBe(false);
  });

  it('RU_KPP only with КПП context', () => {
    expect(detect('КПП 770101001', defaultConfig).some(d => d.type === 'RU_KPP' && d.value === '770101001')).toBe(true);
    expect(detect('номер 770101001 в списке', defaultConfig).some(d => d.type === 'RU_KPP')).toBe(false);
  });

  it('RU_BANK_ACCOUNT: high with valid control key + БИК, medium on context only', () => {
    const bik = '044525999';
    let acc = '';
    for (let d = 0; d <= 9; d++) { const c = '4070281050000000123' + d; if (validateBankAccount(c, bik)) { acc = c; break; } }
    expect(detect(`р/с ${acc} в банке, БИК ${bik}`, defaultConfig).find(d => d.type === 'RU_BANK_ACCOUNT')?.confidence).toBe('high');
    expect(detect(`расчётный счёт ${acc} уточняется`, defaultConfig).find(d => d.type === 'RU_BANK_ACCOUNT')?.confidence).toBe('medium');
    expect(detect(`число ${acc} в отчёте`, defaultConfig).some(d => d.type === 'RU_BANK_ACCOUNT')).toBe(false);
  });
});

describe('US identifiers (context-cued)', () => {
  it('US_EIN only with tax context', () => {
    expect(detect('EIN 12-3456789 on file', defaultConfig).some(d => d.type === 'US_EIN' && d.value === '12-3456789')).toBe(true);
    expect(detect('order 12-3456789 shipped', defaultConfig).some(d => d.type === 'US_EIN')).toBe(false);
  });

  it('US_DRIVER_LICENSE captures the value after the cue', () => {
    const r = detect("Driver's license D1234567 issued in CA", defaultConfig);
    expect(r.some(d => d.type === 'US_DRIVER_LICENSE' && d.value === 'D1234567')).toBe(true);
  });

  it('US_MEDICARE (MBI) only with medicare context', () => {
    expect(detect('Medicare MBI 1EG4TE5MK73', defaultConfig).some(d => d.type === 'US_MEDICARE')).toBe(true);
    expect(detect('Medicare 1EG4-TE5-MK73 active', defaultConfig).some(d => d.type === 'US_MEDICARE' && d.value === '1EG4-TE5-MK73')).toBe(true);
    expect(detect('code 1EG4TE5MK73 random', defaultConfig).some(d => d.type === 'US_MEDICARE')).toBe(false);
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
