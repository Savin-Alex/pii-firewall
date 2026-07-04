/**
 * Runtime-switchable UI localization. Both message tables are bundled from
 * _locales/*, so the interface language can be chosen by the user (Settings →
 * «Язык интерфейса») independently of the browser locale — unlike chrome.i18n,
 * which is fixed to the browser's language. (The manifest name/description still
 * use chrome.i18n / __MSG_ and follow the browser locale.)
 */
import ruMessages from '../_locales/ru/messages.json';
import enMessages from '../_locales/en/messages.json';

type MessageTable = Record<string, { message: string }>;
const TABLES: Record<'ru' | 'en', MessageTable> = {
  ru: ruMessages as MessageTable,
  en: enMessages as MessageTable
};

function browserLang(): 'ru' | 'en' {
  const lang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage)
    ? chrome.i18n.getUILanguage()
    : 'ru';
  return lang.startsWith('en') ? 'en' : 'ru';
}

let current: 'ru' | 'en' = browserLang();

/** Sets the UI language. 'auto' follows the browser locale. */
export function setUiLang(pref: 'auto' | 'ru' | 'en'): void {
  current = pref === 'auto' ? browserLang() : pref;
}

export function uiLang(): 'ru' | 'en' {
  return current;
}

export function t(key: string): string {
  return TABLES[current][key]?.message ?? key;
}

/** Fills every [data-i18n] element's textContent with its localized message. */
export function localizeDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
}
