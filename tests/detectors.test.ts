import { describe, it, expect } from 'vitest';
import { detect } from '../src/engine/engine';
import { detectPersonRu } from '../src/engine/person_ru';
import { EngineConfig } from '../src/engine/types';

const defaultConfig: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'IP_ADDRESS', 'PERSON', 'SECRET'],
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
    const text = 'Мой ИНН 7707083893';
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
    const text = 'ИНН 7707083893'; // INN is 10 digits, but could be part of something else
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
