import { getCurrentSite, SiteConfig } from './sites';
import { resolveEditor, writeEditor } from './editor';
import { Widget } from './widget';
import { Guard } from './guard';
import { Vault, VaultSession } from '../vault/vault';
import { Settings, DEFAULT_SETTINGS, loadSettings, toEngineConfig, guardActiveForSite } from '../settings';
import { setUiLang } from '../i18n';

const DEMO_KEY = 'pii_demo_pending';

let site: SiteConfig | undefined;
let widget: Widget | null = null;
let session: VaultSession = { tabId: 0, url: window.location.href };
let settings: Settings = DEFAULT_SETTINGS;

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
  settings = await loadSettings();
  setUiLang(settings.uiLanguage); // widget/guard strings follow the chosen UI language
  session = { tabId: await fetchTabId(), url: window.location.href };

  // Providers read the live `settings`, so an options change applies without reload.
  widget = new Widget(
    () => session,
    () => toEngineConfig(settings),
    () => resolveEditor(site),
    () => settings.instructionEnabled,
    () => settings.placeholderStyle
  );

  new Guard(
    () => toEngineConfig(settings),
    () => session,
    {
      activeProvider: () => guardActiveForSite(settings, site?.id),
      instructionProvider: () => settings.instructionEnabled,
      styleProvider: () => settings.placeholderStyle
    }
  );

  startWatchdog();
  void consumeDemo();
  console.log('PII Firewall initialized for', site?.id ?? 'unknown site');
}

/**
 * Demo mode (popup / onboarding): a sample was stashed in storage.session and
 * this tab was opened. Paste it into the editor once it exists, then clear the
 * flag so it fires only once.
 */
async function consumeDemo(): Promise<void> {
  if (!chrome.storage?.session) return;
  let pending: string | undefined;
  try {
    pending = (await chrome.storage.session.get(DEMO_KEY))[DEMO_KEY];
  } catch {
    return;
  }
  if (!pending) return;

  // Poll ~20s for the editor. Consume the flag ONLY after a successful paste —
  // if a login wall or slow load hides the editor, the flag survives so the next
  // load on this site still pastes (it clears when the browser closes anyway).
  for (let attempt = 0; attempt < 40; attempt++) {
    const editor = resolveEditor(site);
    if (editor) {
      await writeEditor(editor, pending);
      await chrome.storage.session.remove(DEMO_KEY);
      widget?.ensureAttached();
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

// Live settings: reload when the options page saves.
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      void loadSettings().then(s => { settings = s; setUiLang(s.uiLanguage); });
    }
  });
}

// Hotkeys forwarded by the service worker (manifest commands)
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.command === 'mask-prompt') void widget?.mask();
    else if (message?.command === 'restore-text') void widget?.restore();
    else if (message?.command === 'mask-selection') void widget?.maskSelection(message.selectionText);
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}
