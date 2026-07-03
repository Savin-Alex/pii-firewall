import { Vault } from '../vault/vault';
import { getCurrentSite } from '../content/sites';
import { loadSettings, saveSettings, getLeakCount } from '../settings';
import { t, localizeDom } from '../i18n';

// Synthetic sample for demo mode (checksum-valid, never real data).
const DEMO_TEXT = 'Договор №42. Заказчик: Иванов Пётр Сергеевич, ИНН 7712345671, тел. +7 916 123-45-67, e-mail p.ivanov@example.com. Прошу подготовить акт выполненных работ.';

function toast(msg: string) {
  const el = document.getElementById('toast');
  if (el) el.textContent = msg;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateUI() {
  localizeDom();
  const tab = await currentTab();
  const siteNameEl = document.getElementById('site-name')!;
  const guardRow = document.getElementById('guard-row')!;
  const guardToggle = document.getElementById('guard-site-toggle') as HTMLInputElement;

  let host = '';
  try { host = tab?.url ? new URL(tab.url).hostname : ''; } catch { /* about: pages */ }
  const site = host ? getCurrentSite(host) : undefined;
  siteNameEl.textContent = site ? host : t('popup_site_unsupported');

  const settings = await loadSettings();
  document.getElementById('stats-count')!.textContent = String(await getLeakCount());

  if (site) {
    guardRow.style.display = '';
    guardToggle.checked = settings.guardEnabled && !settings.guardDisabledSites.includes(site.id);
    guardToggle.disabled = !settings.guardEnabled;
    guardToggle.addEventListener('change', async () => {
      const s = await loadSettings();
      const disabled = new Set(s.guardDisabledSites);
      if (guardToggle.checked) disabled.delete(site.id); else disabled.add(site.id);
      await saveSettings({ guardDisabledSites: [...disabled] });
      toast(t('popup_saved'));
    });
  } else {
    guardRow.style.display = 'none';
  }
}

document.getElementById('demo')?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(DEMO_TEXT);
  await chrome.tabs.create({ url: 'https://chatgpt.com/' });
  toast(t('popup_demo_copied'));
});

document.getElementById('forget-session')?.addEventListener('click', async () => {
  const tab = await currentTab();
  if (tab?.url && tab.id) {
    await Vault.forgetSession({ tabId: tab.id, url: tab.url });
    toast(t('popup_forgotten'));
  }
});

document.getElementById('forget-all')?.addEventListener('click', async () => {
  await Vault.clearAll();
  toast(t('popup_forgotten_all'));
});

document.getElementById('open-options')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('open-onboarding')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
});

void updateUI();
