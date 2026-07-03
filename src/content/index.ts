import { getCurrentSite, SiteConfig } from './sites';
import { resolveEditor } from './editor';
import { Widget } from './widget';
import { Vault, VaultSession } from '../vault/vault';
import { EngineConfig } from '../engine/types';

const defaultConfig: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'US_SSN', 'IP_ADDRESS', 'PERSON', 'SECRET'],
  minConfidence: 'medium',
  language: 'auto'
};

let site: SiteConfig | undefined;
let widget: Widget | null = null;
let session: VaultSession = { tabId: 0, url: window.location.href };

async function fetchTabId(): Promise<number> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-tab-id' });
    return response?.tabId ?? 0;
  } catch {
    return 0;
  }
}

function isDraftUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return (site?.draftPaths ?? ['/']).includes(path);
  } catch {
    return false;
  }
}

async function handleUrlChange(newUrl: string): Promise<void> {
  const previous = session;
  session = { tabId: previous.tabId, url: newUrl };
  // A draft conversation just got its permanent id (e.g. chatgpt.com/ -> /c/<id>):
  // move the mapping so restore keeps working. Switching between existing chats
  // intentionally does NOT migrate — conversations stay isolated.
  if (isDraftUrl(previous.url)) {
    try {
      await Vault.migrateSession(previous, session);
    } catch {
      // storage unavailable — nothing to migrate
    }
  }
}

function startWatchdog(): void {
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      void handleUrlChange(lastUrl);
    }
    widget?.ensureAttached();
  }, 800);
}

async function init(): Promise<void> {
  site = getCurrentSite();
  session = { tabId: await fetchTabId(), url: window.location.href };
  widget = new Widget(() => session, defaultConfig, () => resolveEditor(site));
  startWatchdog();
  console.log('PII Firewall initialized for', site?.id ?? 'unknown site');
}

// Hotkeys forwarded by the service worker (manifest commands)
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.command === 'mask-prompt') void widget?.mask();
    else if (message?.command === 'restore-text') void widget?.restore();
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}
