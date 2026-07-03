// Service worker: storage access for content scripts, tab ids, hotkey forwarding.

// chrome.storage.session is TRUSTED_CONTEXTS-only by default — without this call
// every Vault operation in a content script fails. Runs on each SW start.
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

// Content scripts cannot learn their own tab id — they ask us.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-tab-id') {
    sendResponse({ tabId: sender.tab?.id ?? 0 });
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
