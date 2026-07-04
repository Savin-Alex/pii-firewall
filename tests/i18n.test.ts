import { describe, it, expect } from 'vitest';
import { t, setUiLang, uiLang } from '../src/i18n';

describe('UI language switch', () => {
  it('t() returns strings in the selected language', () => {
    setUiLang('ru');
    expect(uiLang()).toBe('ru');
    expect(t('options_save')).toBe('Сохранить');
    expect(t('status_ready')).toBe('Готов к защите');

    setUiLang('en');
    expect(uiLang()).toBe('en');
    expect(t('options_save')).toBe('Save');
    expect(t('status_ready')).toBe('Ready to protect');
  });

  it('falls back to the key for an unknown message', () => {
    setUiLang('ru');
    expect(t('__does_not_exist__')).toBe('__does_not_exist__');
  });

  it("'auto' resolves to a concrete language", () => {
    setUiLang('auto');
    expect(['ru', 'en']).toContain(uiLang());
  });
});
