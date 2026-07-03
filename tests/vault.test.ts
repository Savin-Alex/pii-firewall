import { describe, it, expect, beforeEach } from 'vitest';
import { Vault, PersistentVault, VaultStorageError, VaultSession } from '../src/vault/vault';
import { detect } from '../src/engine/engine';
import { Detection, EngineConfig } from '../src/engine/types';

// --- chrome.storage mock (session + local) with real API shapes: get(null), remove(string[]) ---
function makeStore() {
  const data: Record<string, any> = {};
  return {
    data,
    get: async (keys: string | string[] | null) => {
      if (keys === null) return { ...data };
      const out: Record<string, any> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (k in data) out[k] = data[k];
      }
      return out;
    },
    set: async (items: Record<string, any>) => { Object.assign(data, items); },
    remove: async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    },
    clear: async () => { for (const k in data) delete data[k]; }
  };
}

let sessionStore: ReturnType<typeof makeStore>;
let localStore: ReturnType<typeof makeStore>;

beforeEach(() => {
  sessionStore = makeStore();
  localStore = makeStore();
  (globalThis as any).chrome = { storage: { session: sessionStore, local: localStore } };
});

const session: VaultSession = { tabId: 1, url: 'https://chatgpt.com/c/123' };

describe('Vault Masking & Restoration', () => {
  it('should mask and restore text correctly (full-type placeholders)', async () => {
    const text = 'My name is Ivan Ivanov and my INN is 7712345671';
    const detections: Detection[] = [
      { type: 'PERSON', start: 11, end: 22, value: 'Ivan Ivanov', confidence: 'high', validator: 'heuristic' },
      { type: 'RU_INN', start: 37, end: 47, value: '7712345671', confidence: 'high', validator: 'checksum' }
    ];

    const masked = await Vault.mask(text, detections, session);
    expect(masked).toContain('[PERSON_1]');
    expect(masked).toContain('[RU_INN_1]');
    expect(masked).not.toContain('Ivan Ivanov');
    expect(masked).not.toContain('7712345671');

    const { text: restored, missing } = await Vault.restore(masked, session);
    expect(restored).toBe(text);
    expect(missing).toHaveLength(0);
  });

  it('should maintain stable placeholders for same values', async () => {
    const text = 'Ivan and Ivan again.';
    const detections: Detection[] = [
      { type: 'PERSON', start: 0, end: 4, value: 'Ivan', confidence: 'high', validator: 'heuristic' },
      { type: 'PERSON', start: 9, end: 13, value: 'Ivan', confidence: 'high', validator: 'heuristic' }
    ];

    const masked = await Vault.mask(text, detections, session);
    expect(masked).toBe('[PERSON_1] and [PERSON_1] again.');
  });

  it('should isolate different sessions (wrong-session restore refuses and warns)', async () => {
    const text = 'Secret: 12345';
    const det: Detection = { type: 'SECRET', start: 8, end: 13, value: '12345', confidence: 'high', validator: 'format' };

    const masked = await Vault.mask(text, [det], session);

    const otherSession: VaultSession = { tabId: 1, url: 'https://chatgpt.com/c/456' };
    const { text: restored, missing } = await Vault.restore(masked, otherSession);

    expect(restored).toBe(masked); // Not restored
    expect(missing).toContain('[SECRET_1]');
  });

  it('should not collide with placeholder-like patterns already present in the text', async () => {
    const text = 'Ранее замаскировано: [RU_SNILS_1], новый номер СНИЛС 11223344595.';
    const detections = detect(text, engineConfig);
    expect(detections.some(d => d.type === 'RU_SNILS')).toBe(true);

    const masked = await Vault.mask(text, detections, session);
    expect(masked).toContain('[RU_SNILS_2]'); // literal [RU_SNILS_1] is skipped
    expect(masked).not.toContain('11223344595');

    const { text: restored, missing } = await Vault.restore(masked, session);
    expect(restored).toBe(text); // literal placeholder survives round-trip untouched
    expect(missing).toContain('[RU_SNILS_1]'); // and is honestly reported as unknown
  });

  it('should continue counters across documents in one session without duplicates', async () => {
    const t1 = 'Плательщик Иванов Иван Иванович, ИНН 7712345671.';
    const m1 = await Vault.mask(t1, detect(t1, engineConfig), session);
    const t2 = 'Получатель Мария Петрова, ИНН 771234567859, отправитель Иванов Иван Иванович.';
    const m2 = await Vault.mask(t2, detect(t2, engineConfig), session);

    expect(m1).toContain('[PERSON_1]');
    expect(m2).toContain('[PERSON_2]'); // new person
    expect(m2).toContain('[PERSON_1]'); // co-reference to the first one
    expect(m2).toContain('[RU_INN_2]');

    const mapping = sessionStore.data['vault_1_chatgpt.com/c/123'];
    const placeholders = mapping.map((e: any) => e.placeholder);
    expect(new Set(placeholders).size).toBe(placeholders.length);
  });

  it('clearAll removes only vault_* keys', async () => {
    await sessionStore.set({ guard_stats: { prevented: 7 } });
    await Vault.mask('ИНН 7712345671', detect('ИНН 7712345671', engineConfig), session);
    expect(Object.keys(sessionStore.data).some(k => k.startsWith('vault_'))).toBe(true);

    await Vault.clearAll();
    expect(Object.keys(sessionStore.data).some(k => k.startsWith('vault_'))).toBe(false);
    expect(sessionStore.data.guard_stats).toEqual({ prevented: 7 });
  });

  it('throws loudly instead of masking without a storage backend', async () => {
    const saved = (globalThis as any).chrome;
    delete (globalThis as any).chrome;
    try {
      const det: Detection = { type: 'RU_INN', start: 4, end: 14, value: '7712345671', confidence: 'high', validator: 'checksum' };
      await expect(Vault.mask('ИНН 7712345671', [det], session)).rejects.toThrow(VaultStorageError);
      await expect(Vault.restore('[RU_INN_1]', session)).rejects.toThrow(VaultStorageError);
    } finally {
      (globalThis as any).chrome = saved;
    }
  });
});

describe('Session migration (URL changes after first message)', () => {
  it('moves the mapping to the new conversation URL', async () => {
    const draft: VaultSession = { tabId: 5, url: 'https://chatgpt.com/' };
    const chat: VaultSession = { tabId: 5, url: 'https://chatgpt.com/c/new-id' };

    const text = 'Мой ИНН 7712345671';
    const masked = await Vault.mask(text, detect(text, engineConfig), draft);

    const { migrated, dropped } = await Vault.migrateSession(draft, chat);
    expect(migrated).toBe(1);
    expect(dropped).toBe(0);
    expect(sessionStore.data['vault_5_chatgpt.com/']).toBeUndefined();

    const { text: restored, missing } = await Vault.restore(masked, chat);
    expect(restored).toBe(text);
    expect(missing).toHaveLength(0);
  });

  it('keeps target entries on conflicts and reports drops', async () => {
    const a: VaultSession = { tabId: 6, url: 'https://claude.ai/' };
    const b: VaultSession = { tabId: 6, url: 'https://claude.ai/chat/x' };

    const mA = await Vault.mask('Автор Мария Петрова', detect('Автор Мария Петрова', engineConfig), a);
    const mB = await Vault.mask('Автор Сергей Козлов', detect('Автор Сергей Козлов', engineConfig), b);
    expect(mA).toContain('[PERSON_1]');
    expect(mB).toContain('[PERSON_1]'); // same placeholder, different sessions

    const { migrated, dropped } = await Vault.migrateSession(a, b);
    expect(migrated).toBe(0);
    expect(dropped).toBe(1);

    const { text: restored } = await Vault.restore(mB, b);
    expect(restored).toBe('Автор Сергей Козлов'); // target mapping intact
  });
});

// --- property test: mask→restore round-trip on random synthetic docs (M2 acceptance) ---

const engineConfig: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'US_SSN', 'IP_ADDRESS', 'PERSON', 'SECRET'],
  minConfidence: 'medium',
  language: 'auto'
};

describe('Round-trip property (random synthetic docs)', () => {
  let state = 0xc0ffee;
  const rand = () => {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];

  const ENTITIES = [
    'test.user42@example.com', 'anna.volkova77@test-mail.ru',
    '+7 (916) 123-45-67', '8 921 555 44 33', '89261234567',
    '123-456-789 64', 'СНИЛС 11223344595',
    'ИНН 7712345671', 'ИНН 771234567859', 'ОГРН 1207700012343',
    'карта 2200 1234 5678 9019', 'полис ОМС 7800000123456789',
    'IBAN DE12500105170648489890', 'SSN 123-45-6789',
    '192.168.10.42', 'Иванов Иван Иванович', 'Мария Петрова',
    'Саше Иванову', 'Dr. John Smith', 'паспорт 4510 123456 выдан',
    // ключ из документации AWS, собран в рантайме — чтобы сканеры секретов не видели паттерн в исходнике
    ['AKIA', 'IOSFODNN7EXAMPLE'].join(''), 'пароль=Sup3rSecretVal99',
    'ключ f47ac10b58cc4372a5670e02b2c3d479'
  ];
  const FILLER = ['договор', 'подписан', 'вчера', 'документы', 'отправлены', 'по адресу', 'офис', 'встреча', 'перенесена', 'на', 'среду', 'бюджет', 'согласован', 'без', 'изменений', 'спасибо', 'коллеги'];

  it('masks everything detected and restores the exact original', async () => {
    for (let i = 0; i < 120; i++) {
      const parts: string[] = [];
      const n = 3 + Math.floor(rand() * 10);
      for (let j = 0; j < n; j++) {
        parts.push(rand() < 0.4 ? pick(ENTITIES) : pick(FILLER));
        if (rand() < 0.2) parts.push(pick(FILLER) + (rand() < 0.5 ? ',' : '.'));
      }
      const text = parts.join(' ');
      const docSession: VaultSession = { tabId: i, url: `https://chatgpt.com/c/${i}` };
      const detections = detect(text, engineConfig);

      const masked = await Vault.mask(text, detections, docSession);
      for (const d of detections) {
        expect(masked.includes(text.substring(d.start, d.end)), `unmasked ${d.type} in doc#${i}`).toBe(false);
      }

      const { text: restored, missing } = await Vault.restore(masked, docSession);
      expect(restored, `round-trip doc#${i}`).toBe(text);
      expect(missing, `missing in doc#${i}`).toHaveLength(0);
    }
  });
});

describe('PersistentVault (opt-in AES-GCM)', () => {
  it('persists encrypted and hydrates back with the right passphrase', async () => {
    const text = 'Плательщик Иванов Иван Иванович, СНИЛС 123-456-789 64.';
    const masked = await Vault.mask(text, detect(text, engineConfig), session);

    const persisted = await PersistentVault.persist('correct horse battery staple');
    expect(persisted).toBe(1);
    expect(await PersistentVault.isEnabled()).toBe(true);

    // the blob at rest is encrypted: no plaintext values or placeholders
    const blob = JSON.stringify(localStore.data);
    expect(blob).not.toContain('Иванов');
    expect(blob).not.toContain('123-456-789');
    expect(blob).not.toContain('PERSON_1');

    // simulate browser restart: session storage is wiped
    await sessionStore.clear();
    const hydrated = await PersistentVault.hydrate('correct horse battery staple');
    expect(hydrated).toBe(1);

    const { text: restored, missing } = await Vault.restore(masked, session);
    expect(restored).toBe(text);
    expect(missing).toHaveLength(0);
  });

  it('rejects a wrong passphrase and can be disabled', async () => {
    const text = 'ИНН 7712345671';
    await Vault.mask(text, detect(text, engineConfig), session);
    await PersistentVault.persist('right-pass');

    await sessionStore.clear();
    await expect(PersistentVault.hydrate('wrong-pass')).rejects.toThrow(/wrong passphrase/);

    await PersistentVault.disable();
    expect(await PersistentVault.isEnabled()).toBe(false);
    expect(await PersistentVault.hydrate('right-pass')).toBe(0);
  });
});
