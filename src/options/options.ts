import { Vault, PersistentVault } from '../vault/vault';
import { PII_TYPES, loadSettings, saveSettings, Settings } from '../settings';
import { t, uiLang, localizeDom } from '../i18n';

const lang = uiLang();

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
  (document.getElementById('guard-enabled') as HTMLInputElement).checked = settings.guardEnabled;
  (document.getElementById('instruction-enabled') as HTMLInputElement).checked = settings.instructionEnabled;
  (document.getElementById('language') as HTMLSelectElement).value = settings.language;
  document.getElementById('persist-status')!.textContent =
    (await PersistentVault.isEnabled()) ? t('options_persist_on') : t('options_persist_off');
}

function collect(): Partial<Settings> {
  const enabledTypes = Array.from(document.querySelectorAll<HTMLInputElement>('.type-checkbox'))
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.id!)
    .filter(Boolean);
  return {
    enabledTypes,
    guardEnabled: (document.getElementById('guard-enabled') as HTMLInputElement).checked,
    instructionEnabled: (document.getElementById('instruction-enabled') as HTMLInputElement).checked,
    language: (document.getElementById('language') as HTMLSelectElement).value as Settings['language']
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
