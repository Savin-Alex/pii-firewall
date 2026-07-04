/**
 * Checksum algorithms for various IDs.
 */

export function validateLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let val = parseInt(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      val *= 2;
      if (val > 9) val -= 9;
    }
    sum += val;
  }
  return sum % 10 === 0;
}

export function validateSNILS(snils: string): boolean {
  const digits = snils.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (parseInt(digits.substring(0, 9)) <= 1001998) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (9 - i);
  }

  let control = sum % 101;
  if (control === 100) control = 0;
  if (control === 101) control = 0; // Extra safety

  return control === parseInt(digits.substring(9, 11));
}

export function validateINN(inn: string): boolean {
  const digits = inn.replace(/\D/g, '');
  if (digits.length === 10) {
    const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * weights[i];
    return (sum % 11) % 10 === parseInt(digits[9]);
  } else if (digits.length === 12) {
    const weights1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    let sum1 = 0;
    for (let i = 0; i < 10; i++) sum1 += parseInt(digits[i]) * weights1[i];
    const d10 = (sum1 % 11) % 10;

    const weights2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    let sum2 = 0;
    for (let i = 0; i < 11; i++) sum2 += parseInt(digits[i]) * weights2[i];
    const d11 = (sum2 % 11) % 10;

    return d10 === parseInt(digits[10]) && d11 === parseInt(digits[11]);
  }
  return false;
}

export function validateOGRN(ogrn: string): boolean {
  const digits = ogrn.replace(/\D/g, '');
  if (digits.length === 13) {
    const n = BigInt(digits.substring(0, 12));
    return Number((n % 11n) % 10n) === parseInt(digits[12]);
  } else if (digits.length === 15) {
    const n = BigInt(digits.substring(0, 14));
    return Number((n % 13n) % 10n) === parseInt(digits[14]);
  }
  return false;
}

export function validateIBAN(iban: string): boolean {
  const clean = iban.replace(/[\s-]/g, '').toUpperCase();
  if (clean.length < 15) return false;
  
  const rearranged = clean.substring(4) + clean.substring(0, 4);
  const numeric = rearranged.split('').map(char => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return (code - 55).toString();
    return char;
  }).join('');

  let remainder = 0n;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10n + BigInt(numeric[i])) % 97n;
  }
  return remainder === 1n;
}

/**
 * Russian bank account control-key check (ЦБ РФ). Needs the BIK:
 * settlement accounts use the BIK's last 3 digits as prefix; correspondent
 * accounts (starting 301) use "0" + BIK positions 5-6. Weighted 7-1-3 over the
 * 23-digit string, each product mod 10, total mod 10 must be 0.
 */
export function validateBankAccount(account: string, bik: string): boolean {
  const acc = account.replace(/\D/g, '');
  const b = bik.replace(/\D/g, '');
  if (acc.length !== 20 || b.length !== 9) return false;
  const prefix = acc.startsWith('301') ? '0' + b.substring(4, 6) : b.substring(6, 9);
  const full = prefix + acc; // 23 digits
  const weights = [7, 1, 3];
  let sum = 0;
  for (let i = 0; i < 23; i++) sum += (parseInt(full[i], 10) * weights[i % 3]) % 10;
  return sum % 10 === 0;
}
