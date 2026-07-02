import { describe, it, expect } from 'vitest';
import { validateLuhn, validateSNILS, validateINN, validateOGRN, validateIBAN } from '../src/engine/checksums';

describe('Checksums', () => {
  it('Luhn (Cards/OMS)', () => {
    expect(validateLuhn('79927398713')).toBe(true);
    expect(validateLuhn('79927398714')).toBe(false);
  });

  it('SNILS', () => {
    // Valid synthetic SNILS
    expect(validateSNILS('112-233-445 95')).toBe(true);
    expect(validateSNILS('11223344595')).toBe(true);
    // Invalid
    expect(validateSNILS('001-001-001 00')).toBe(false); // Reserved range
    expect(validateSNILS('112-233-445 96')).toBe(false);
  });

  it('INN', () => {
    // 10 digits (Legal entity)
    expect(validateINN('7707083893')).toBe(true);
    expect(validateINN('7707083894')).toBe(false);
    // 12 digits (Individual)
    expect(validateINN('500100732259')).toBe(true);
    expect(validateINN('500100732260')).toBe(false);
  });

  it('OGRN', () => {
    expect(validateOGRN('1027700132195')).toBe(true);
    expect(validateOGRN('1027700132196')).toBe(false);
    expect(validateOGRN('304500116000157')).toBe(true);
  });

  it('IBAN', () => {
    // Valid synthetic IBAN (mod 97 === 1)
    expect(validateIBAN('DE89370400440532013000')).toBe(true);
    expect(validateIBAN('GB82WEST12345698765432')).toBe(true);
    // Invalid check digits
    expect(validateIBAN('DE61370400440532013000')).toBe(false);
    expect(validateIBAN('DE00370400440532013000')).toBe(false);
  });
});
