/**
 * Deterministic synthetic corpus generator (seeded PRNG, no real data).
 * Regenerate with: npm run gen:corpus
 *
 * Every identifier is built by computing its check digits, then verified
 * against the engine validators. Negative items are verified to stay silent
 * through the actual detect() pipeline, except deliberate known-FP items
 * kept to keep the precision metric honest.
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { validateLuhn, validateSNILS, validateINN, validateOGRN, validateIBAN } from '../src/engine/checksums';
import { detect } from '../src/engine/engine';
import { EngineConfig } from '../src/engine/types';

// --- seeded PRNG (mulberry32) ---
let state = 0x5eed2026;
function rand(): number {
  state |= 0; state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const digit = () => Math.floor(rand() * 10);
const digits = (n: number) => Array.from({ length: n }, digit).join('');
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// --- check-digit builders ---
function luhnComplete(base: string): string {
  for (let c = 0; c <= 9; c++) {
    if (validateLuhn(base + c)) return base + c;
  }
  throw new Error('luhn');
}

function makeSnils(): string {
  // Above the reserved range; formatted ###-###-### ##
  const body = String(2000000 + Math.floor(rand() * 900000000 % 997000000)).padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(body[i]) * (9 - i);
  let control = sum % 101;
  if (control === 100) control = 0;
  const raw = body + String(control).padStart(2, '0');
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)} ${raw.slice(9)}`;
}

function makeInn10(): string {
  const w = [2, 4, 10, 3, 5, 9, 4, 6, 8];
  const base = '77' + digits(7);
  const check = (base.split('').reduce((s, d, i) => s + Number(d) * w[i], 0) % 11) % 10;
  return base + check;
}

function makeInn12(): string {
  const w11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  const w12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  const base = '77' + digits(8);
  const d10 = (base.split('').reduce((s, d, i) => s + Number(d) * w11[i], 0) % 11) % 10;
  const b11 = base + d10;
  const d11 = (b11.split('').reduce((s, d, i) => s + Number(d) * w12[i], 0) % 11) % 10;
  return b11 + d11;
}

function makeOgrn13(): string {
  const base = '1' + String(10 + Math.floor(rand() * 16)) + '77' + digits(7);
  return base + Number(BigInt(base) % 11n % 10n);
}

function makeOgrn15(): string {
  const base = '3' + String(10 + Math.floor(rand() * 16)) + '77' + digits(9);
  return base + Number(BigInt(base) % 13n % 10n);
}

function makeCard16(grouped: boolean): string {
  const base = pick(['4276', '5469', '2200']) + digits(11);
  const card = luhnComplete(base);
  if (!grouped) return card;
  return card.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function makeOms16(): string {
  return luhnComplete('78' + digits(13));
}

function ibanCheck(country: string, bban: string): string {
  const numeric = (bban + country + '00').split('').map(c => /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c).join('');
  let r = 0n;
  for (const ch of numeric) r = (r * 10n + BigInt(ch)) % 97n;
  return String(98n - r).padStart(2, '0');
}

function makeIbanDE(): string {
  const bban = digits(18);
  return 'DE' + ibanCheck('DE', bban) + bban;
}

function makeIbanGB(): string {
  const bban = 'TEST' + digits(14);
  return 'GB' + ibanCheck('GB', bban) + bban;
}

function makePhone(): { value: string } {
  const p = digits(9);
  const forms = [
    `+7 (9${p.slice(0, 2)}) ${p.slice(2, 5)}-${p.slice(5, 7)}-${p.slice(7, 9)}`,
    `8 9${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 7)} ${p.slice(7, 9)}`,
    `8-9${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5, 7)}-${p.slice(7, 9)}`,
    `+79${p}`,
    `89${p}`,
    `8 (812) ${p.slice(2, 5)}-${p.slice(5, 7)}-${p.slice(7, 9)}`
  ];
  return { value: pick(forms) };
}

function makeSsn(): string {
  const area = String(1 + Math.floor(rand() * 665)).padStart(3, '0');
  const safeArea = area === '666' ? '667' : area;
  const group = String(1 + Math.floor(rand() * 99)).padStart(2, '0');
  const serial = String(1 + Math.floor(rand() * 9999)).padStart(4, '0');
  return `${safeArea}-${group}-${serial}`;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HEX = '0123456789abcdef';
const chars = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');

function entropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  return Object.values(freq).reduce((sum, f) => sum - (f / s.length) * Math.log2(f / s.length), 0);
}

function makeHexSecret(): string {
  for (let i = 0; i < 100; i++) {
    const s = chars(HEX, 32);
    if (entropy(s) > 3.45) return s; // margin above the 3.3 detector threshold
  }
  throw new Error('hex entropy');
}

function makeB64Secret(): string {
  for (let i = 0; i < 100; i++) {
    const s = chars(B64, 40);
    if (entropy(s) > 4.3) return s;
  }
  throw new Error('b64 entropy');
}

function makeJwt(): string {
  return `eyJ${chars(B64URL, 17)}.eyJ${chars(B64URL, 29)}.${chars(B64URL, 32)}`;
}

const makeAws = () => 'AKIA' + chars('ABCDEFGHJKLMNPQRSTUVWXYZ234567', 16);
const makeIp = () => pick(['10', '172', '192']) === '10'
  ? `10.${Math.floor(rand() * 256)}.${Math.floor(rand() * 256)}.${Math.floor(rand() * 254) + 1}`
  : `192.168.${Math.floor(rand() * 256)}.${Math.floor(rand() * 254) + 1}`;
const makeEmail = () => `${pick(['ivan', 'anna', 'sergey', 'maria', 'oleg', 'elena'])}.${pick(['petrov', 'smirnova', 'kuznetsov', 'volkova'])}${Math.floor(rand() * 90) + 10}@${pick(['example.com', 'example.org', 'test-mail.ru'])}`;

function corrupt(value: string): string {
  // Flip one digit so the checksum fails; keep format.
  const idx = value.length - 1;
  const d = Number(value[idx]);
  return value.slice(0, idx) + ((d + 5) % 10);
}

// --- persons: curated grammatically-correct forms ---
const TRIPLES_NOM = ['Иванов Иван Иванович', 'Петрова Анна Сергеевна', 'Сидоров Алексей Петрович', 'Кузнецова Мария Владимировна', 'Смирнов Дмитрий Николаевич', 'Васильева Ольга Игоревна'];
const TRIPLES_DECLINED = ['Иванову Ивану Ивановичу', 'Петровой Анне Сергеевне', 'Сидорова Алексея Петровича', 'Кузнецову Михаилу Андреевичу', 'Смирновой Татьяны Олеговны'];
const PAIRS_NOM = ['Елена Волкова', 'Сергей Козлов', 'Анна Морозова', 'Дмитрий Соколов', 'Ирина Зайцева', 'Павел Лебедев'];
const PAIRS_DECLINED = ['Марии Петровой', 'Сергея Кузнецова', 'Ольге Новиковой', 'Андрею Соколову', 'Екатерины Волковой', 'Саше Иванову'];
const PAIRS_SURNAME_FIRST = ['Волков Андрей', 'Зайцева Ирина', 'Морозов Никита'];
const INITIALS = ['Иванов И.И.', 'Петров А.С.', 'Сидорова Е.В.', 'А.Б. Кузнецов'];
const EN_TITLED = ['Dr. John Smith', 'Mr. James Brown', 'Ms. Emily Davis'];
const DIMINUTIVE_PAIRS = ['Маша Сидорова', 'Дима Козлов'];
// Known engine blind spots, kept in the corpus so persons recall stays honest.
const HARD_PERSONS = ['Тимербулатов', 'Шарипова Аделина', 'Гульнара Ахметова', 'Рустам Алиев', 'Оксаны Белых', 'Жумабек Салтанат', 'Пак Хёнсу', 'John Smith', 'Mary Johnson'];

interface Expected { type: string; value: string }
interface Item { text: string; expected: Expected[] }

const items: Item[] = [];
const add = (text: string, expected: Expected[]) => items.push({ text, expected });

// --- positive items ---
for (const [i, fio] of TRIPLES_NOM.entries()) {
  const inn = i % 2 === 0 ? makeInn12() : makeInn10();
  const snils = makeSnils();
  add(`Договор №${10 + i}. Исполнитель: ${fio}, ИНН ${inn}, СНИЛС ${snils}.`, [
    { type: 'PERSON', value: fio },
    { type: 'RU_INN', value: inn },
    { type: 'RU_SNILS', value: snils }
  ]);
}

for (const fio of TRIPLES_DECLINED) {
  const passport = `${digits(4)} ${digits(6)}`;
  add(`Доверенность выдана ${fio}, паспорт ${passport}, зарегистрированному по месту жительства.`, [
    { type: 'PERSON', value: fio },
    { type: 'RU_PASSPORT', value: passport }
  ]);
}

for (const pair of PAIRS_NOM) {
  const phone = makePhone().value;
  const email = makeEmail();
  add(`Контактное лицо: ${pair}, тел. ${phone}, почта ${email}.`, [
    { type: 'PERSON', value: pair },
    { type: 'PHONE', value: phone },
    { type: 'EMAIL', value: email }
  ]);
}

for (const pair of PAIRS_DECLINED) {
  add(`Заявление от ${pair} принято в работу секретарём канцелярии.`, [
    { type: 'PERSON', value: pair }
  ]);
}

for (const pair of PAIRS_SURNAME_FIRST) {
  const snils = makeSnils();
  add(`Сотрудник ${pair}, СНИЛС ${snils}, допущен к работе.`, [
    { type: 'PERSON', value: pair },
    { type: 'RU_SNILS', value: snils }
  ]);
}

for (const initials of INITIALS) {
  add(`Подпись: ${initials}, расшифровка прилагается.`, [
    { type: 'PERSON', value: initials }
  ]);
}

for (const en of EN_TITLED) {
  const ssn = makeSsn();
  add(`Employee record: ${en}, SSN ${ssn}, department QA.`, [
    { type: 'PERSON', value: en },
    { type: 'US_SSN', value: ssn }
  ]);
}

for (const pair of DIMINUTIVE_PAIRS) {
  add(`Передай ${pair} документы до пятницы.`, [
    { type: 'PERSON', value: pair }
  ]);
}

for (const hard of HARD_PERSONS) {
  add(`Обращение подготовил(а) ${hard} без дополнительных реквизитов.`, [
    { type: 'PERSON', value: hard }
  ]);
}

// medical
for (let i = 0; i < 3; i++) {
  const oms = makeOms16();
  const snils = makeSnils();
  add(`Медкарта пациента: полис ОМС ${oms}, СНИЛС ${snils}, направлен на обследование.`, [
    { type: 'RU_OMS', value: oms },
    { type: 'RU_SNILS', value: snils }
  ]);
}

// companies
for (let i = 0; i < 3; i++) {
  const ogrn = makeOgrn13();
  const inn = makeInn10();
  add(`ООО «Пример-${i + 1}»: ОГРН ${ogrn}, ИНН ${inn}, юридический адрес уточняется.`, [
    { type: 'RU_OGRN', value: ogrn },
    { type: 'RU_INN', value: inn }
  ]);
}
for (let i = 0; i < 2; i++) {
  const ogrn = makeOgrn15();
  const inn = makeInn12();
  add(`ИП зарегистрирован: ОГРНИП ${ogrn}, ИНН ${inn}.`, [
    { type: 'RU_OGRN', value: ogrn },
    { type: 'RU_INN', value: inn }
  ]);
}

// payments
for (let i = 0; i < 3; i++) {
  const card = makeCard16(true);
  const iban = i === 0 ? makeIbanGB() : makeIbanDE();
  add(`Оплата: карта ${card}, либо перевод на счет IBAN ${iban}.`, [
    { type: 'CARD', value: card },
    { type: 'IBAN', value: iban }
  ]);
}
{
  const card = makeCard16(false);
  add(`Спишите средства с карты ${card} по договору оферты.`, [
    { type: 'CARD', value: card }
  ]);
}

// passports with context
for (let i = 0; i < 2; i++) {
  const passport = `${digits(4)} ${digits(6)}`;
  add(`Паспорт гражданина: серия и номер ${passport}, выдан отделом УФМС.`, [
    { type: 'RU_PASSPORT', value: passport }
  ]);
}

// phones/emails/ips standalone
for (let i = 0; i < 4; i++) {
  const phone = makePhone().value;
  add(`Горячая линия поддержки: ${phone}, звонок бесплатный.`, [
    { type: 'PHONE', value: phone }
  ]);
}
{
  const email = makeEmail();
  const ip = makeIp();
  add(`Логи доступа: пользователь ${email} входил с адреса ${ip}.`, [
    { type: 'EMAIL', value: email },
    { type: 'IP_ADDRESS', value: ip }
  ]);
}
{
  const ip = makeIp();
  add(`Сервер БД слушает на ${ip}, порт 5432.`, [
    { type: 'IP_ADDRESS', value: ip }
  ]);
}

// homoglyph email (Cyrillic "а" in the local part context)
add('Резервная почта: bаckup.admin@example.com, проверьте доступ.', [
  { type: 'EMAIL', value: 'bаckup.admin@example.com' }
]);

// secrets
{
  const kv = makeB64Secret();
  const ip = makeIp();
  add(`Конфигурация: api_key="${kv}", хост ${ip}.`, [
    { type: 'SECRET_KV', value: kv },
    { type: 'IP_ADDRESS', value: ip }
  ]);
}
{
  const aws = makeAws();
  const jwt = makeJwt();
  add(`В логах CI найдены ${aws} и токен ${jwt} — ротируйте немедленно.`, [
    { type: 'SECRET_AWS', value: aws },
    { type: 'SECRET_JWT', value: jwt }
  ]);
}
{
  const hex = makeHexSecret();
  add(`Ключ шифрования ${hex} попал в переписку.`, [
    { type: 'SECRET_ENTROPY', value: hex }
  ]);
}
{
  const kv = 'Sup3r' + chars('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 12);
  add(`Доступ к стенду: пароль=${kv} действует до конца недели.`, [
    { type: 'SECRET_KV', value: kv }
  ]);
}

// --- hard structured cases: expected but currently missed (documented in README) ---
add('Паспорт: серия 45 03 123456, выдан 10 лет назад.', [
  { type: 'RU_PASSPORT', value: '45 03 123456' }
]);
add('Реквизиты в нижнем регистре: счет de89370400440532013000 в банке.', [
  { type: 'IBAN', value: 'de89370400440532013000' }
]);
add('Контакт из визитки: тел. 8.916.123.45.67 (устаревший формат с точками).', [
  { type: 'PHONE', value: '8.916.123.45.67' }
]);

// --- negatives: must stay silent ---
const negatives: string[] = [
  `Заказ №${corrupt(makeInn10())} отправлен, трек RA${digits(7)}RU, ожидайте.`,
  `Сборка 2.15.${Math.floor(rand() * 40)} прошла CI за 8 минут.`,
  `commit ${chars(HEX, 40)} влит в основную ветку.`,
  'Встреча 15.03.2024 в 15:30, Новый Год отметим позже.',
  `СНИЛС указан с ошибкой: ${corrupt(makeSnils())} — проверьте контрольное число.`,
  `Карта ${corrupt(makeCard16(true))} не прошла проверку Luhn.`,
  `ИНН ${corrupt(makeInn12())} не найден в реестре ФНС.`,
  `ОГРН ${corrupt(makeOgrn13())} отклонён валидатором.`,
  'Позвоните по добавочному 1234 или напишите в чат.',
  'ГОСТ 12345-89 регламентирует маркировку, температура хранения 36.6.',
  'Код подтверждения 481516 действителен 5 минут.',
  'Численность аудитории 146500000 человек по данным переписи.',
  'SSN недействителен: 000-12-3456, 666-45-6789 и 123-45-0000 отклонены.',
  'Диапазон адресов 300.400.500.600 не является корректным IPv4.',
  'Версия прошивки 4.2.1-beta, серийный номер устройства A1B2C3.',
  'Хеш md5 5d41402abc4b2a76b9719d911017c592 совпадает с эталоном.',
  'Новый Договор вступает в силу с момента подписания Сторонами.',
  'Инвентаризация: позиции 12, 45, 78, 90 перемещены на склад №3.',
  `Стоимость 1499 руб., скидка 20%, промокод ЛЕТО${digits(4)}.`,
  'Рейс SU 1492 задержан, выход B7, посадка через 40 минут.'
];

// Deliberate known-FP item: a bare Luhn-valid 16-digit order number reads as CARD (medium).
const fpOrder = luhnComplete('492912345678123');
negatives.push(`Номер заказа ${fpOrder} подтверждён, отгрузка завтра.`);

for (const text of negatives) add(text, []);

// --- self-checks ---
const config: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'US_SSN', 'IP_ADDRESS', 'PERSON', 'SECRET'],
  minConfidence: 'medium',
  language: 'auto'
};

for (const item of items) {
  for (const e of item.expected) {
    if (!item.text.includes(e.value)) throw new Error(`expected value not in text: ${e.value}`);
    if (e.type === 'RU_SNILS' && !e.value.includes('.') && !validateSNILS(e.value)) throw new Error(`bad SNILS ${e.value}`);
    if (e.type === 'RU_INN' && !validateINN(e.value)) throw new Error(`bad INN ${e.value}`);
    if (e.type === 'RU_OGRN' && !validateOGRN(e.value)) throw new Error(`bad OGRN ${e.value}`);
    if (e.type === 'RU_OMS' && !validateLuhn(e.value)) throw new Error(`bad OMS ${e.value}`);
    if (e.type === 'CARD' && !/[a-z]/.test(e.value) && !validateLuhn(e.value.replace(/\D/g, ''))) throw new Error(`bad CARD ${e.value}`);
    if (e.type === 'IBAN' && e.value === e.value.toUpperCase() && !validateIBAN(e.value)) throw new Error(`bad IBAN ${e.value}`);
  }
}

// negatives (except the deliberate FP) must stay silent
for (const text of negatives.slice(0, -1)) {
  const hits = detect(text, config);
  if (hits.length > 0) {
    throw new Error(`negative item is not silent: "${text}" -> ${hits.map(h => `${h.type}:${h.value}`).join(', ')}`);
  }
}

// --- metrics preview (same math as tests/corpus.test.ts) ---
let sExp = 0, sDet = 0, sTP = 0, pExp = 0, pTP = 0;
for (const item of items) {
  const results = detect(item.text, config);
  const expStructured = item.expected.filter(e => e.type !== 'PERSON');
  const detStructured = results.filter(r => r.type !== 'PERSON');
  sExp += expStructured.length;
  sDet += detStructured.length;
  const remaining = [...detStructured];
  for (const e of expStructured) {
    const i = remaining.findIndex(d => d.type === e.type && d.value === e.value);
    if (i !== -1) { sTP++; remaining.splice(i, 1); }
  }
  const persons = item.expected.filter(e => e.type === 'PERSON');
  pExp += persons.length;
  const remainingP = results.filter(r => r.type === 'PERSON');
  for (const e of persons) {
    const i = remainingP.findIndex(d => d.value === e.value);
    if (i !== -1) { pTP++; remainingP.splice(i, 1); }
  }
}

console.log(`items: ${items.length} (negatives: ${negatives.length})`);
console.log(`structured: expected=${sExp} detected=${sDet} TP=${sTP} P=${(sTP / sDet).toFixed(4)} R=${(sTP / sExp).toFixed(4)}`);
console.log(`persons: expected=${pExp} TP=${pTP} R=${(pTP / pExp).toFixed(4)}`);

const out = resolve(__dirname, '../tests/corpus/synthetic-corpus.json');
writeFileSync(out, JSON.stringify(items, null, 2) + '\n');
console.log(`written: ${out}`);
