import { describe, it, expect } from 'vitest';
import { validateLuhn, validateSNILS, validateINN, validateOGRN, validateIBAN, validateBankAccount } from '../src/engine/checksums';

function makeValidAccount(base19: string, bik: string): string {
  for (let d = 0; d <= 9; d++) if (validateBankAccount(base19 + d, bik)) return base19 + d;
  throw new Error('no control digit');
}

// All values are synthetic: check digits computed by scripts/generate-corpus.ts helpers.
describe('Checksums', () => {
  it('Luhn (Cards/OMS)', () => {
    expect(validateLuhn('79927398713')).toBe(true);
    expect(validateLuhn('79927398714')).toBe(false);
    expect(validateLuhn('2200123456789019')).toBe(true);
    expect(validateLuhn('2200123456789010')).toBe(false);
  });

  it('SNILS', () => {
    // Valid synthetic SNILS
    expect(validateSNILS('112-233-445 95')).toBe(true);
    expect(validateSNILS('11223344595')).toBe(true);
    expect(validateSNILS('123-456-789 64')).toBe(true);
    // Invalid
    expect(validateSNILS('001-001-001 00')).toBe(false); // Reserved range
    expect(validateSNILS('112-233-445 96')).toBe(false);
    expect(validateSNILS('123-456-789 65')).toBe(false);
  });

  it('INN', () => {
    // 10 digits (Legal entity)
    expect(validateINN('7712345671')).toBe(true);
    expect(validateINN('7712345672')).toBe(false);
    // 12 digits (Individual)
    expect(validateINN('771234567859')).toBe(true);
    expect(validateINN('771234567850')).toBe(false);
  });

  it('OGRN', () => {
    // 13 digits (Legal entity)
    expect(validateOGRN('1207700012343')).toBe(true);
    expect(validateOGRN('1207700012344')).toBe(false);
    // 15 digits (OGRNIP)
    expect(validateOGRN('312770001234569')).toBe(true);
    expect(validateOGRN('312770001234560')).toBe(false);
  });

  it('Bank account (control key vs BIK)', () => {
    const bik = '044525999'; // synthetic БИК (starts 04)
    const acc = makeValidAccount('4070281050000000123', bik);
    expect(validateBankAccount(acc, bik)).toBe(true);
    // flip the control digit -> invalid
    expect(validateBankAccount(acc.slice(0, -1) + ((Number(acc.slice(-1)) + 1) % 10), bik)).toBe(false);
    // wrong lengths
    expect(validateBankAccount('123', bik)).toBe(false);
    expect(validateBankAccount(acc, '04452599')).toBe(false);
  });

  it('IBAN', () => {
    // Valid synthetic IBAN (mod 97 === 1)
    expect(validateIBAN('DE89370400440532013000')).toBe(true);
    expect(validateIBAN('GB82WEST12345698765432')).toBe(true);
    expect(validateIBAN('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(validateIBAN('DE12500105170648489890')).toBe(true);
    // Invalid check digits
    expect(validateIBAN('DE61370400440532013000')).toBe(false);
    expect(validateIBAN('GB82WEST12345698765433')).toBe(false);
    expect(validateIBAN('DE00370400440532013000')).toBe(false);
  });
});
