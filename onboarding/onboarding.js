// Plain browser script (no bundling): extension-page CSP forbids inline scripts,
// so copy/demo handlers are wired here via addEventListener.

const DEMO_TEXT = 'Договор №42. Заказчик: Иванов Пётр Сергеевич (ИНН 7712345671). Телефон: +7 916 123-45-67. Прошу составить акт приёмки.';

document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const el = document.getElementById(btn.getAttribute('data-copy'));
    if (!el) return;
    await navigator.clipboard.writeText(el.innerText);
    btn.textContent = 'Скопировано ✓';
    setTimeout(() => { btn.textContent = 'Копировать'; }, 2000);
  });
});

document.getElementById('demo-btn')?.addEventListener('click', async () => {
  // Content script reads this flag on load and pastes the sample into the editor.
  try { await chrome.storage.session.set({ pii_demo_pending: DEMO_TEXT }); } catch (e) { /* ignore */ }
  await navigator.clipboard.writeText(DEMO_TEXT).catch(() => {});
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: 'https://chatgpt.com/' });
  } else {
    window.open('https://chatgpt.com/', '_blank');
  }
});
