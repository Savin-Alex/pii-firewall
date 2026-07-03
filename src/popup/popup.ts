import { Vault } from '../vault/vault';
import { getCurrentSite } from '../content/sites';

async function updateUI() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const siteNameEl = document.getElementById('site-name');
  const statsCountEl = document.getElementById('stats-count');

  // Update site name
  if (tab.url) {
    try {
      const url = new URL(tab.url);
      siteNameEl!.textContent = url.hostname;
    } catch {
      siteNameEl!.textContent = 'Неизвестно';
    }
  }

  // Update stats (from local storage)
  const stats = await chrome.storage.local.get('leak_prevented_count');
  statsCountEl!.textContent = (stats.leak_prevented_count || 0).toString();
}

document.getElementById('open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('open-onboarding')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'onboarding/onboarding.html' });
});

document.getElementById('forget-session')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && tab.id) {
    await Vault.forgetSession({ tabId: tab.id, url: tab.url });
    window.close();
  }
});

updateUI();
