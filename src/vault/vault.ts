import { Detection } from '../engine/types';
import { EncryptedPayload, encryptJson, decryptJson } from './crypto';

export interface VaultSession {
  tabId: number;
  url: string;
}

export interface VaultEntry {
  original: string;
  placeholder: string;
  type: string;
}

/** Thrown when chrome.storage is unavailable: masking without a vault would be unrecoverable. */
export class VaultStorageError extends Error {
  constructor(message = 'Vault storage is unavailable (chrome.storage not found)') {
    super(message);
    this.name = 'VaultStorageError';
  }
}

const SESSION_PREFIX = 'vault_';
const PERSISTENT_KEY = 'vault_persistent_v1';
const PLACEHOLDER_RE = /\[([A-Z_]+)_(\d+)\]/g;

function sessionStore(): typeof chrome.storage.session {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) throw new VaultStorageError();
  return chrome.storage.session;
}

function localStore(): typeof chrome.storage.local {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) throw new VaultStorageError();
  return chrome.storage.local;
}

/**
 * Manages reversible masking using chrome.storage.session.
 * Placeholders carry the full detection type (scope format): [PERSON_1], [RU_SNILS_1], [SECRET_KV_1].
 */
export class Vault {
  // Serializes read-modify-write operations so concurrent mask() calls can't lose entries.
  private static queue: Promise<unknown> = Promise.resolve();

  private static enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private static async getMapping(sessionId: string): Promise<VaultEntry[]> {
    const key = SESSION_PREFIX + sessionId;
    const data = await sessionStore().get(key);
    return data[key] || [];
  }

  private static async saveMapping(sessionId: string, mapping: VaultEntry[]): Promise<void> {
    await sessionStore().set({ [SESSION_PREFIX + sessionId]: mapping });
  }

  static generateSessionId(session: VaultSession): string {
    try {
      const url = new URL(session.url);
      return `${session.tabId}_${url.hostname}${url.pathname}`;
    } catch {
      return `${session.tabId}_unknown`;
    }
  }

  /**
   * Replaces detected PII with placeholders and stores them in the vault.
   * Same original value gets the same placeholder within a session.
   */
  static async mask(text: string, detections: Detection[], session: VaultSession): Promise<string> {
    sessionStore(); // fail loudly before masking anything
    return this.enqueue(async () => {
      const sessionId = this.generateSessionId(session);
      const mapping = await this.getMapping(sessionId);

      // Sort detections backwards to replace without breaking offsets
      const sorted = [...detections].sort((a, b) => b.start - a.start);
      let maskedText = text;

      // Seed counters from the mapping AND from placeholder-like patterns already
      // present in the input text, so a pasted "[RU_SNILS_1]" can never collide
      // with a newly issued placeholder (that would corrupt restore).
      const typeCounters: Record<string, number> = {};
      const bump = (placeholder: string) => {
        const m = /^\[([A-Z_]+)_(\d+)\]$/.exec(placeholder);
        if (m) typeCounters[m[1]] = Math.max(typeCounters[m[1]] || 0, parseInt(m[2], 10));
      };
      mapping.forEach(entry => bump(entry.placeholder));
      for (const m of text.matchAll(PLACEHOLDER_RE)) bump(m[0]);

      for (const det of sorted) {
        const originalValue = text.substring(det.start, det.end);

        // Check if we already have this value masked in this session
        let entry = mapping.find(e => e.original === originalValue);

        if (!entry) {
          typeCounters[det.type] = (typeCounters[det.type] || 0) + 1;
          entry = {
            original: originalValue,
            placeholder: `[${det.type}_${typeCounters[det.type]}]`,
            type: det.type
          };
          mapping.push(entry);
        }

        maskedText = maskedText.substring(0, det.start) + entry.placeholder + maskedText.substring(det.end);
      }

      await this.saveMapping(sessionId, mapping);
      return maskedText;
    });
  }

  /**
   * Restores original values from placeholders.
   * Unknown (e.g. wrong-session) placeholders are left as-is and reported in `missing`.
   */
  static async restore(text: string, session: VaultSession): Promise<{ text: string; missing: string[] }> {
    const sessionId = this.generateSessionId(session);
    const mapping = await this.getMapping(sessionId);
    let restoredText = text;
    const missing: string[] = [];

    const foundPlaceholders = Array.from(text.matchAll(PLACEHOLDER_RE));
    foundPlaceholders.sort((a, b) => b.index! - a.index!);

    for (const match of foundPlaceholders) {
      const fullPlaceholder = match[0];
      const entry = mapping.find(e => e.placeholder === fullPlaceholder);

      if (entry) {
        restoredText = restoredText.substring(0, match.index!) + entry.original + restoredText.substring(match.index! + fullPlaceholder.length);
      } else if (!missing.includes(fullPlaceholder)) {
        missing.push(fullPlaceholder);
      }
    }

    return { text: restoredText, missing };
  }

  /**
   * Moves a session's mapping to a new session id — e.g. when ChatGPT navigates
   * from chatgpt.com/ to chatgpt.com/c/<id> after the first message.
   * On conflicts (placeholder or value already taken in the target) the target wins.
   */
  static async migrateSession(from: VaultSession, to: VaultSession): Promise<{ migrated: number; dropped: number }> {
    sessionStore();
    return this.enqueue(async () => {
      const fromId = this.generateSessionId(from);
      const toId = this.generateSessionId(to);
      if (fromId === toId) return { migrated: 0, dropped: 0 };

      const source = await this.getMapping(fromId);
      if (source.length === 0) return { migrated: 0, dropped: 0 };
      const target = await this.getMapping(toId);

      const takenPlaceholders = new Set(target.map(e => e.placeholder));
      const takenValues = new Set(target.map(e => e.original));
      const movable = source.filter(e => !takenPlaceholders.has(e.placeholder) && !takenValues.has(e.original));

      await this.saveMapping(toId, [...target, ...movable]);
      await sessionStore().remove(SESSION_PREFIX + fromId);
      return { migrated: movable.length, dropped: source.length - movable.length };
    });
  }

  static async forgetSession(session: VaultSession): Promise<void> {
    await sessionStore().remove(SESSION_PREFIX + this.generateSessionId(session));
  }

  /** Removes all vault_* mappings, leaving other extension session data untouched. */
  static async clearAll(): Promise<void> {
    const store = sessionStore();
    const all = await store.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith(SESSION_PREFIX));
    if (keys.length > 0) await store.remove(keys);
  }
}

/**
 * Opt-in encrypted persistence: snapshots all session mappings into
 * chrome.storage.local as one AES-GCM blob. Only value↔placeholder pairs are
 * stored (never prompt text), and only encrypted. Wiring (passphrase prompt,
 * auto-persist) belongs to the options UI (M5).
 */
export class PersistentVault {
  static async persist(passphrase: string): Promise<number> {
    const all = await sessionStore().get(null);
    const vaultData: Record<string, VaultEntry[]> = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(SESSION_PREFIX)) vaultData[key] = value;
    }
    const payload = await encryptJson(vaultData, passphrase);
    await localStore().set({ [PERSISTENT_KEY]: payload });
    return Object.keys(vaultData).length;
  }

  static async hydrate(passphrase: string): Promise<number> {
    const data = await localStore().get(PERSISTENT_KEY);
    const payload: EncryptedPayload | undefined = data[PERSISTENT_KEY];
    if (!payload) return 0;
    const vaultData = await decryptJson<Record<string, VaultEntry[]>>(payload, passphrase);
    if (Object.keys(vaultData).length > 0) await sessionStore().set(vaultData);
    return Object.keys(vaultData).length;
  }

  static async isEnabled(): Promise<boolean> {
    const data = await localStore().get(PERSISTENT_KEY);
    return Boolean(data[PERSISTENT_KEY]);
  }

  static async disable(): Promise<void> {
    await localStore().remove(PERSISTENT_KEY);
  }
}
