const DATA_TYPES = [
  { id: 'PERSON', label: 'ФИО', desc: 'Имена, фамилии и отчества' },
  { id: 'PHONE', label: 'Телефоны', desc: 'Российские и международные номера' },
  { id: 'EMAIL', label: 'Email', desc: 'Адреса электронной почты' },
  { id: 'CARD', label: 'Банковские карты', desc: 'Номера карт (валидация Луна)' },
  { id: 'RU_INN', label: 'ИНН', desc: 'Идентификационный номер налогоплательщика' },
  { id: 'RU_SNILS', label: 'СНИЛС', desc: 'Страховой номер счета' },
  { id: 'SECRET', label: 'Секреты', desc: 'API-ключи, токены, пароли' }
];

async function loadOptions() {
  const container = document.getElementById('types-list');
  const settings = await chrome.storage.local.get(['enabledTypes', 'guardEnabled', 'instructionEnabled']);
  
  const enabledTypes = settings.enabledTypes || DATA_TYPES.map(t => t.id);
  
  DATA_TYPES.forEach(type => {
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
      <div class="option-info">
        <span class="option-label">${type.label}</span>
        <span class="option-desc">${type.desc}</span>
      </div>
      <label class="switch">
        <input type="checkbox" class="type-checkbox" data-id="${type.id}" ${enabledTypes.includes(type.id) ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
    container?.appendChild(row);
  });

  (document.getElementById('guard-enabled') as HTMLInputElement).checked = settings.guardEnabled !== false;
  (document.getElementById('instruction-enabled') as HTMLInputElement).checked = settings.instructionEnabled !== false;
}

document.getElementById('save')?.addEventListener('click', async () => {
  const checkboxes = document.querySelectorAll('.type-checkbox');
  const enabledTypes = Array.from(checkboxes)
    .filter(cb => (cb as HTMLInputElement).checked)
    .map(cb => (cb as HTMLElement).dataset.id);

  const guardEnabled = (document.getElementById('guard-enabled') as HTMLInputElement).checked;
  const instructionEnabled = (document.getElementById('instruction-enabled') as HTMLInputElement).checked;

  await chrome.storage.local.set({
    enabledTypes,
    guardEnabled,
    instructionEnabled
  });

  alert('Настройки сохранены');
});

loadOptions();
