// Service worker: storage access for content scripts, tab ids, hotkey forwarding.
import { t, setUiLang } from '../i18n';
import { loadSettings } from '../settings';

// chrome.storage.session is TRUSTED_CONTEXTS-only by default — without this call
// every Vault operation in a content script fails. Runs on each SW start.
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

// Content scripts cannot learn their own tab id — they ask us.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-tab-id') {
    sendResponse({ tabId: sender.tab?.id ?? 0 });
  }
});

// Supported chat hosts — keep in sync with manifest content_scripts.matches.
const SITE_PATTERNS = [
  'https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*',
  'https://gemini.google.com/*', 'https://www.perplexity.ai/*', 'https://perplexity.ai/*',
  'https://poe.com/*', 'https://chat.deepseek.com/*', 'https://grok.com/*',
  'https://alice.yandex.ru/*', 'https://giga.chat/*'
];

// (Re)creates the context menu with a title in the chosen UI language.
async function refreshContextMenu(): Promise<void> {
  setUiLang((await loadSettings()).uiLanguage);
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'pii-mask-selection',
    title: t('ctx_mask_selection'),
    contexts: ['selection'],
    documentUrlPatterns: SITE_PATTERNS
  });
}

// First run: open onboarding + register the "mask selection" context-menu item.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
  void refreshContextMenu();
});

// Keep the menu title in sync when the interface language changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) void refreshContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pii-mask-selection' && tab?.id) {
    // selectionText also carries textarea selections that window.getSelection() misses.
    chrome.tabs.sendMessage(tab.id, { command: 'mask-selection', selectionText: info.selectionText }).catch(() => {});
  }
});

// Manifest commands (Alt+Shift+M / Alt+Shift+U) -> active tab
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { command }).catch(() => {
        // No content script on this page — ignore.
      });
    }
  });
});
