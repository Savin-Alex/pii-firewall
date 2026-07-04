import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SETTINGS, DEFAULT_ENABLED_TYPES, PII_TYPES,
  loadSettings, saveSettings, toEngineConfig, guardActiveForSite,
  getLeakCount, incrementLeakCount, sanitizeSettings
} from '../src/settings';

function mockLocal() {
  const data: Record<string, any> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: data[key] }),
        set: async (items: Record<string, any>) => { Object.assign(data, items); }
      }
    }
  };
  return data;
}

describe('Settings defaults', () => {
  it('DATE_OF_BIRTH is opt-in (off by default), everything else on', () => {
    expect(DEFAULT_ENABLED_TYPES).not.toContain('DATE_OF_BIRTH');
    expect(DEFAULT_ENABLED_TYPES).toContain('PERSON');
    expect(DEFAULT_ENABLED_TYPES).toContain('SECRET');
    // every non-DOB type is enabled by default
    expect(DEFAULT_ENABLED_TYPES.length).toBe(PII_TYPES.length - 1);
  });

  it('toEngineConfig carries the enabled set, confidence and language', () => {
    const cfg = toEngineConfig({ ...DEFAULT_SETTINGS, language: 'ru', minConfidence: 'high' });
    expect(cfg.enabledTypes).toEqual(DEFAULT_ENABLED_TYPES);
    expect(cfg.language).toBe('ru');
    expect(cfg.minConfidence).toBe('high');
  });
});

describe('guardActiveForSite', () => {
  it('off when globally disabled', () => {
    expect(guardActiveForSite({ ...DEFAULT_SETTINGS, guardEnabled: false }, 'chatgpt')).toBe(false);
  });
  it('off when the site is in the per-site disabled list', () => {
    expect(guardActiveForSite({ ...DEFAULT_SETTINGS, guardDisabledSites: ['claude'] }, 'claude')).toBe(false);
    expect(guardActiveForSite({ ...DEFAULT_SETTINGS, guardDisabledSites: ['claude'] }, 'chatgpt')).toBe(true);
  });
  it('on by default for a supported site', () => {
    expect(guardActiveForSite(DEFAULT_SETTINGS, 'chatgpt')).toBe(true);
  });
});

describe('Persisted settings', () => {
  beforeEach(() => { mockLocal(); });

  it('loadSettings falls back to defaults and merges a partial patch', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await saveSettings({ guardEnabled: false, enabledTypes: ['EMAIL'] });
    const s = await loadSettings();
    expect(s.guardEnabled).toBe(false);
    expect(s.enabledTypes).toEqual(['EMAIL']);
    expect(s.language).toBe('auto'); // untouched field keeps its default
  });

  it('leak counter increments and persists', async () => {
    expect(await getLeakCount()).toBe(0);
    await incrementLeakCount();
    await incrementLeakCount();
    expect(await getLeakCount()).toBe(2);
  });
});

describe('sanitizeSettings (import validation)', () => {
  it('keeps valid values and drops malformed ones', () => {
    const out = sanitizeSettings({
      enabledTypes: ['EMAIL', 'BOGUS', 123],
      minConfidence: 'ultra',
      language: 'ru',
      guardEnabled: 'yes',
      instructionEnabled: false,
      guardDisabledSites: ['poe', 5],
      placeholderStyle: 'square',
      evil: 'x'
    });
    expect(out.enabledTypes).toEqual(['EMAIL']);
    expect(out.minConfidence).toBeUndefined();
    expect(out.language).toBe('ru');
    expect(out.guardEnabled).toBeUndefined();
    expect(out.instructionEnabled).toBe(false);
    expect(out.guardDisabledSites).toEqual(['poe']);
    expect(out.placeholderStyle).toBe('square');
    expect((out as Record<string, unknown>).evil).toBeUndefined();
  });

  it('returns {} for non-objects', () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings('nope')).toEqual({});
    expect(sanitizeSettings(42)).toEqual({});
  });
});

describe('No storage backend', () => {
  it('loadSettings returns defaults without throwing', async () => {
    delete (globalThis as any).chrome;
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await getLeakCount()).toBe(0);
  });
});
