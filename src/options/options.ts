import { Vault, PersistentVault } from '../vault/vault';
import { PII_TYPES, PII_GROUPS, loadSettings, saveSettings, sanitizeSettings, Settings } from '../settings';
import { SITES } from '../content/sites';
import { PlaceholderStyle } from '../vault/placeholder';
import { t, uiLang, setUiLang, localizeDom } from '../i18n';

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

function makeSwitch(cls: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement('label');
  label.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = cls;
  input.checked = checked;
  const slider = document.createElement('span');
  slider.className = 'slider';
  label.append(input, slider);
  return { label, input };
}

function refreshMaster(group: string) {
  const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(`.type-checkbox[data-group="${group}"]`));
  const master = document.querySelector<HTMLInputElement>(`.group-master[data-group="${group}"]`);
  if (!master) return;
  const on = boxes.filter(b => b.checked).length;
  master.checked = on === boxes.length;
  master.indeterminate = on > 0 && on < boxes.length;
}

function renderTypes(enabled: string[]) {
  const lang = uiLang();
  const container = document.getElementById('types-list')!;
  container.textContent = '';

  for (const group of PII_GROUPS) {
    const types = PII_TYPES.filter(t => t.group === group.id);
    if (types.length === 0) continue;

    // group header + master toggle
    const header = document.createElement('div');
    header.className = 'row group-row';
    const gLabel = document.createElement('span');
    gLabel.className = 'group-label';
    gLabel.textContent = group.label[lang];
    const { label: gSwitch, input: master } = makeSwitch('group-master', false);
    master.dataset.group = group.id;
    master.addEventListener('change', () => {
      document.querySelectorAll<HTMLInputElement>(`.type-checkbox[data-group="${group.id}"]`)
        .forEach(cb => { cb.checked = master.checked; });
      master.indeterminate = false;
    });
    header.append(gLabel, gSwitch);
    container.appendChild(header);

    for (const type of types) {
      const row = document.createElement('div');
      row.className = 'row type-row';
      const info = document.createElement('div');
      info.className = 'info';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = type.label[lang];
      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = type.desc[lang];
      info.append(label, desc);

      const { label: sw, input: cb } = makeSwitch('type-checkbox', enabled.includes(type.id));
      cb.dataset.id = type.id;
      cb.dataset.group = group.id;
      cb.addEventListener('change', () => refreshMaster(group.id));

      row.append(info, sw);
      container.appendChild(row);
    }
    refreshMaster(group.id);
  }
}

async function load() {
  const settings = await loadSettings();
  setUiLang(settings.uiLanguage); // pick language BEFORE localizing / rendering labels
  localizeDom();
  renderTypes(settings.enabledTypes);
  renderSites(settings.guardDisabledSites);
  (document.getElementById('ui-language') as HTMLSelectElement).value = settings.uiLanguage;
  (document.getElementById('guard-enabled') as HTMLInputElement).checked = settings.guardEnabled;
  (document.getElementById('instruction-enabled') as HTMLInputElement).checked = settings.instructionEnabled;
  (document.getElementById('language') as HTMLSelectElement).value = settings.language;
  (document.getElementById('placeholder-style') as HTMLSelectElement).value = settings.placeholderStyle;
  document.getElementById('persist-status')!.textContent =
    (await PersistentVault.isEnabled()) ? t('options_persist_on') : t('options_persist_off');
}

// Interface language applies immediately: persist the in-progress form + the new
// language, then re-render everything localized (so unsaved toggles aren't lost).
document.getElementById('ui-language')?.addEventListener('change', async (e) => {
  const uiLanguage = (e.target as HTMLSelectElement).value as Settings['uiLanguage'];
  await saveSettings({ ...collect(), uiLanguage });
  await load();
});

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
    placeholderStyle: (document.getElementById('placeholder-style') as HTMLSelectElement).value as PlaceholderStyle,
    uiLanguage: (document.getElementById('ui-language') as HTMLSelectElement).value as Settings['uiLanguage']
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
  await PersistentVault.disable(); // also wipe the encrypted persistent snapshot on disk
  document.getElementById('persist-status')!.textContent = t('options_persist_off');
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
    // Validate keys AND values — a malformed file must not corrupt the config.
    const clean = sanitizeSettings(JSON.parse(await file.text()));
    await saveSettings(clean);
    await load();
    flash(t('options_imported'));
  } catch {
    flash(t('options_import_error'));
  } finally {
    importFile.value = '';
  }
});

function passphrase(): string {
  return (document.getElementById('passphrase') as HTMLInputElement).value;
}

document.getElementById('persist-enable')?.addEventListener('click', async () => {
  const pass = passphrase();
  if (pass.length < 6) { flash(t('options_persist_weak')); return; }
  // Don't overwrite an existing snapshot with an empty session (e.g. right after
  // a browser restart, before the user has restored).
  const sessions = await Vault.listSessions().catch(() => []);
  if (sessions.length === 0 && await PersistentVault.isEnabled()) { flash(t('options_persist_empty')); return; }
  try {
    await PersistentVault.persist(pass);
    document.getElementById('persist-status')!.textContent = t('options_persist_on');
    flash(t('options_saved'));
  } catch {
    flash(t('options_persist_error'));
  }
});

document.getElementById('persist-restore')?.addEventListener('click', async () => {
  const pass = passphrase();
  if (pass.length < 6) { flash(t('options_persist_weak')); return; }
  try {
    const n = await PersistentVault.hydrate(pass);
    document.getElementById('persist-status')!.textContent = t('options_persist_on');
    flash(n > 0 ? t('options_persist_restored') : t('options_persist_empty'));
  } catch {
    flash(t('options_persist_error')); // wrong passphrase or corrupted blob
  }
});

document.getElementById('persist-disable')?.addEventListener('click', async () => {
  await PersistentVault.disable();
  document.getElementById('persist-status')!.textContent = t('options_persist_off');
  flash(t('options_saved'));
});

void load();
