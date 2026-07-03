import { getCurrentSite, SiteConfig, FALLBACK_EDITOR } from './sites';
import { Widget } from './widget';
import { VaultSession } from '../vault/vault';
import { EngineConfig } from '../engine/types';

let widget: Widget | null = null;

const defaultConfig: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'US_SSN', 'IP_ADDRESS', 'PERSON'],
  minConfidence: 'medium',
  language: 'auto'
};

function init() {
  const site = getCurrentSite();
  if (!site && !document.querySelector(FALLBACK_EDITOR)) return;

  const session: VaultSession = {
    tabId: 0, // Will be filled by background if needed, or handled by Vault.generateSessionId
    url: window.location.href
  };

  // In a real extension, we'd fetch config from chrome.storage.local
  widget = new Widget(session, defaultConfig);
  console.log('PII Firewall initialized for', site?.id || 'unknown site');
}

// Listen for messages from background script (commands)
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.command === 'mask-prompt') {
      // Trigger mask logic via widget or directly
      console.log('Command: mask-prompt');
    } else if (message.command === 'restore-selection') {
      console.log('Command: restore-selection');
    }
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
