import { EngineConfig, Confidence } from './engine/types';
import { PlaceholderStyle } from './vault/placeholder';

/** Bilingual label. RU is the primary locale (spec M5). */
export interface L10n {
  ru: string;
  en: string;
}

export interface PiiGroup {
  id: string;
  label: L10n;
}

/** Display groups for the options UI (rendered in this order, each with a master toggle). */
export const PII_GROUPS: PiiGroup[] = [
  { id: 'identity', label: { ru: 'Личность и контакты', en: 'Identity & contacts' } },
  { id: 'ru', label: { ru: 'Документы РФ', en: 'Russian documents' } },
  { id: 'us', label: { ru: 'Документы США', en: 'US documents' } },
  { id: 'financial', label: { ru: 'Финансы', en: 'Financial' } },
  { id: 'business', label: { ru: 'Реквизиты компаний (РФ)', en: 'RU company details' } },
  { id: 'tech', label: { ru: 'Технические и секреты', en: 'Technical & secrets' } }
];

export interface PiiTypeMeta {
  id: string;
  group: string;
  label: L10n;
  desc: L10n;
  /** Whether the type is on in a fresh install. DATE_OF_BIRTH is opt-in (spec M1). */
  defaultOn: boolean;
}

/** Every detector the UI can toggle. `SECRET` is the umbrella for all SECRET_* subtypes. */
export const PII_TYPES: PiiTypeMeta[] = [
  { id: 'PERSON', group: 'identity', label: { ru: 'ФИО', en: 'Names' }, desc: { ru: 'Имена, фамилии, отчества', en: 'Full names and patronymics' }, defaultOn: true },
  { id: 'DATE_OF_BIRTH', group: 'identity', label: { ru: 'Дата рождения', en: 'Date of birth' }, desc: { ru: 'Опционально — по умолчанию выкл.', en: 'Opt-in — off by default' }, defaultOn: false },
  { id: 'EMAIL', group: 'identity', label: { ru: 'Email', en: 'Email' }, desc: { ru: 'Адреса электронной почты', en: 'Email addresses' }, defaultOn: true },
  { id: 'PHONE', group: 'identity', label: { ru: 'Телефоны', en: 'Phones' }, desc: { ru: 'Российские и международные номера', en: 'RU and international numbers' }, defaultOn: true },

  { id: 'RU_INN', group: 'ru', label: { ru: 'ИНН', en: 'INN (RU tax id)' }, desc: { ru: 'ИНН физлиц и организаций', en: 'RU taxpayer number' }, defaultOn: true },
  { id: 'RU_SNILS', group: 'ru', label: { ru: 'СНИЛС', en: 'SNILS' }, desc: { ru: 'Страховой номер счёта', en: 'RU insurance account number' }, defaultOn: true },
  { id: 'RU_OGRN', group: 'ru', label: { ru: 'ОГРН', en: 'OGRN' }, desc: { ru: 'Регистрационный номер (13/15)', en: 'RU company registration id' }, defaultOn: true },
  { id: 'RU_PASSPORT', group: 'ru', label: { ru: 'Паспорт РФ', en: 'RU passport' }, desc: { ru: 'Серия и номер по контексту', en: 'Series+number by context' }, defaultOn: true },
  { id: 'RU_DRIVER_LICENSE', group: 'ru', label: { ru: 'Водительское удостоверение', en: 'RU driver license' }, desc: { ru: 'Серия и номер по контексту', en: 'Series+number by context' }, defaultOn: true },
  { id: 'RU_OMS', group: 'ru', label: { ru: 'Полис ОМС', en: 'OMS policy' }, desc: { ru: '16 цифр, проверка Луна', en: '16 digits, Luhn' }, defaultOn: true },

  { id: 'US_SSN', group: 'us', label: { ru: 'SSN (США)', en: 'US SSN' }, desc: { ru: 'Номер соц. страхования США', en: 'US social security number' }, defaultOn: true },
  { id: 'US_EIN', group: 'us', label: { ru: 'EIN (Tax ID США)', en: 'US EIN (tax id)' }, desc: { ru: 'Налоговый номер работодателя, по контексту', en: 'Employer tax id, by context' }, defaultOn: true },
  { id: 'US_DRIVER_LICENSE', group: 'us', label: { ru: 'Driver License (США)', en: 'US driver license' }, desc: { ru: 'По контексту (формат зависит от штата)', en: 'By context (state-dependent)' }, defaultOn: true },
  { id: 'US_MEDICARE', group: 'us', label: { ru: 'Medicare (США)', en: 'US Medicare' }, desc: { ru: 'Номер MBI, по контексту', en: 'MBI number, by context' }, defaultOn: true },

  { id: 'CARD', group: 'financial', label: { ru: 'Банковские карты', en: 'Bank cards' }, desc: { ru: 'Номера карт (проверка Луна)', en: 'Card numbers (Luhn)' }, defaultOn: true },
  { id: 'IBAN', group: 'financial', label: { ru: 'IBAN', en: 'IBAN' }, desc: { ru: 'Счёт IBAN (mod-97)', en: 'IBAN account (mod-97)' }, defaultOn: true },

  { id: 'RU_BANK_ACCOUNT', group: 'business', label: { ru: 'Расчётный / корр. счёт', en: 'RU bank account' }, desc: { ru: '20 цифр, проверка ключа по БИК', en: '20 digits, control key vs BIK' }, defaultOn: true },
  { id: 'RU_BIK', group: 'business', label: { ru: 'БИК', en: 'BIK' }, desc: { ru: 'Банковский идентификационный код', en: 'RU bank identifier code' }, defaultOn: true },
  { id: 'RU_KPP', group: 'business', label: { ru: 'КПП', en: 'KPP' }, desc: { ru: 'Код причины постановки на учёт', en: 'RU tax registration reason code' }, defaultOn: true },

  { id: 'IP_ADDRESS', group: 'tech', label: { ru: 'IP-адреса', en: 'IP addresses' }, desc: { ru: 'IPv4 и IPv6', en: 'IPv4 and IPv6' }, defaultOn: true },
  { id: 'SECRET', group: 'tech', label: { ru: 'Секреты', en: 'Secrets' }, desc: { ru: 'API-ключи, токены, пароли', en: 'API keys, tokens, passwords' }, defaultOn: true }
];

export const DEFAULT_ENABLED_TYPES = PII_TYPES.filter(t => t.defaultOn).map(t => t.id);

export interface Settings {
  enabledTypes: string[];
  minConfidence: Confidence;
  language: 'auto' | 'ru' | 'en';
  /** Guard mode (intercept send) globally on. */
  guardEnabled: boolean;
  /** Site ids (see sites.ts) where guard is switched off. */
  guardDisabledSites: string[];
  /** Append the "keep the placeholders" instruction after masking. */
  instructionEnabled: boolean;
  /** Bracket style for placeholders. Square survives markdown sanitizers best. */
  placeholderStyle: PlaceholderStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  enabledTypes: DEFAULT_ENABLED_TYPES,
  minConfidence: 'medium',
  language: 'auto',
  guardEnabled: true,
  guardDisabledSites: [],
  instructionEnabled: true,
  placeholderStyle: 'square'
};

const SETTINGS_KEY = 'settings';
const STATS_KEY = 'leak_prevented_count';

function hasLocalStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

export async function loadSettings(): Promise<Settings> {
  if (!hasLocalStorage()) return { ...DEFAULT_SETTINGS };
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  if (hasLocalStorage()) await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export function toEngineConfig(s: Settings): EngineConfig {
  return {
    enabledTypes: s.enabledTypes,
    minConfidence: s.minConfidence,
    language: s.language
  };
}

export function guardActiveForSite(s: Settings, siteId: string | undefined): boolean {
  if (!s.guardEnabled) return false;
  if (siteId && s.guardDisabledSites.includes(siteId)) return false;
  return true;
}

export async function getLeakCount(): Promise<number> {
  if (!hasLocalStorage()) return 0;
  const data = await chrome.storage.local.get(STATS_KEY);
  return data[STATS_KEY] || 0;
}

export async function incrementLeakCount(by = 1): Promise<number> {
  const next = (await getLeakCount()) + by;
  if (hasLocalStorage()) await chrome.storage.local.set({ [STATS_KEY]: next });
  return next;
}
