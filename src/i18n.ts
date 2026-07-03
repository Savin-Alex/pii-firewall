/**
 * Thin wrapper over chrome.i18n. Strings live in _locales/<lang>/messages.json;
 * default_locale (manifest) is ru. Outside the extension (tests) t() falls back
 * to the key so nothing throws.
 */
export function t(key: string, subs?: string | string[]): string {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    const msg = chrome.i18n.getMessage(key, subs);
    if (msg) return msg;
  }
  return key;
}

export function uiLang(): 'ru' | 'en' {
  const lang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage)
    ? chrome.i18n.getUILanguage()
    : 'ru';
  return lang.startsWith('en') ? 'en' : 'ru';
}

/** Fills every [data-i18n] element's textContent with its localized message. */
export function localizeDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
}
