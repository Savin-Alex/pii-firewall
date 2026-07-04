import { Vault, PersistentVault } from '../vault/vault';
import { PII_TYPES, loadSettings, saveSettings, DEFAULT_SETTINGS, Settings } from '../settings';
import { SITES } from '../content/sites';
import { PlaceholderStyle } from '../vault/placeholder';
import { t, uiLang, localizeDom } from '../i18n';

const lang = uiLang();

function renderSites(disabled: string[]) {
  const container = document.getElementById('sites-list')!;
  container.textContent = '';
  for (const site of SITES) {
    const row = document.createElement('div');
    row.className = 'row';
    const info = document.createElement('div');
    info.className = 'info';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = site.id;
    const desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = site.match.join(', ');
    info.append(label, desc);

    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'site-guard';
    cb.dataset.id = site.id;
    cb.checked = !disabled.includes(site.id); // checked = guard ON for this site
    const slider = document.createElement('span');
    slider.className = 'slider';
    sw.append(cb, slider);

    row.append(info, sw);
    container.appendChild(row);
  }
}

function renderTypes(enabled: string[]) {
  const container = document.getElementById('types-list')!;
  container.textContent = '';
  for (const type of PII_TYPES) {
    const row = document.createElement('div');
    row.className = 'row';

    const info = document.createElement('div');
    info.className = 'info';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = type.label[lang];
    const desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = type.desc[lang];
    info.append(label, desc);

    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'type-checkbox';
    cb.dataset.id = type.id;
    cb.checked = enabled.includes(type.id);
    const slider = document.createElement('span');
    slider.className = 'slider';
    sw.append(cb, slider);

    row.append(info, sw);
    container.appendChild(row);
  }
}

async function load() {
  localizeDom();
  const settings = await loadSettings();
  renderTypes(settings.enabledTypes);
  renderSites(settings.guardDisabledSites);
  (document.getElementById('guard-enabled') as HTMLInputElement).checked = settings.guardEnabled;
  (document.getElementById('instruction-enabled') as HTMLInputElement).checked = settings.instructionEnabled;
  (document.getElementById('language') as HTMLSelectElement).value = settings.language;
  (document.getElementById('placeholder-style') as HTMLSelectElement).value = settings.placeholderStyle;
  document.getElementById('persist-status')!.textContent =
    (await PersistentVault.isEnabled()) ? t('options_persist_on') : t('options_persist_off');
}

function collect(): Partial<Settings> {
  const enabledTypes = Array.from(document.querySelectorAll<HTMLInputElement>('.type-checkbox'))
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.id!)
    .filter(Boolean);
  const guardDisabledSites = Array.from(document.querySelectorAll<HTMLInputElement>('.site-guard'))
    .filter(cb => !cb.checked) // unchecked = guard OFF for this site
    .map(cb => cb.dataset.id!)
    .filter(Boolean);
  return {
    enabledTypes,
    guardDisabledSites,
    guardEnabled: (document.getElementById('guard-enabled') as HTMLInputElement).checked,
    instructionEnabled: (document.getElementById('instruction-enabled') as HTMLInputElement).checked,
    language: (document.getElementById('language') as HTMLSelectElement).value as Settings['language'],
    placeholderStyle: (document.getElementById('placeholder-style') as HTMLSelectElement).value as PlaceholderStyle
  };
}

function flash(msg: string) {
  const el = document.getElementById('saved')!;
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 2500);
}

document.getElementById('save')?.addEventListener('click', async () => {
  await saveSettings(collect());
  flash(t('options_saved'));
});

document.getElementById('forget-all')?.addEventListener('click', async () => {
  await Vault.clearAll();
  flash(t('options_forgotten'));
});

// Export: settings only (no PII, no vault). Save what's currently on screen.
document.getElementById('export')?.addEventListener('click', async () => {
  const settings = { ...await loadSettings(), ...collect() };
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pii-firewall-settings.json';
  a.click();
  URL.revokeObjectURL(url);
  flash(t('options_exported'));
});

const importFile = document.getElementById('import-file') as HTMLInputElement;
document.getElementById('import')?.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    // Keep only known settings keys — never trust an arbitrary file wholesale.
    const clean: Partial<Settings> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (key in parsed) (clean as any)[key] = parsed[key];
    }
    await saveSettings(clean);
    await load();
    flash(t('options_imported'));
  } catch {
    flash(t('options_import_error'));
  } finally {
    importFile.value = '';
  }
});

document.getElementById('persist-enable')?.addEventListener('click', async () => {
  const pass = (document.getElementById('passphrase') as HTMLInputElement).value;
  if (pass.length < 6) { flash(t('options_persist_weak')); return; }
  try {
    await PersistentVault.persist(pass);
    document.getElementById('persist-status')!.textContent = t('options_persist_on');
    flash(t('options_saved'));
  } catch {
    flash(t('options_persist_error'));
  }
});

document.getElementById('persist-disable')?.addEventListener('click', async () => {
  await PersistentVault.disable();
  document.getElementById('persist-status')!.textContent = t('options_persist_off');
  flash(t('options_saved'));
});

void load();
