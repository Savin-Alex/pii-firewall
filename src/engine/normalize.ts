/**
 * Unicode NFKC normalization and combining marks removal.
 * Homoglyph mapping for identifier validation.
 */

export function normalize(text: string): string {
  // NFKC normalization and remove combining marks (U+0300–U+036F)
  return text
    .normalize('NFKC')
    .replace(/[\u0300-\u036f]/g, '');
}

const HOMOGLYPH_MAP: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X'
};

const REVERSE_HOMOGLYPH_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(HOMOGLYPH_MAP).map(([ru, en]) => [en, ru])
);

/**
 * Canonicalizes text by mapping homoglyphs to a single representation (e.g. all to Latin or all to Cyrillic)
 * for checksum validation purposes.
 */
export function canonicalizeHomoglyphs(text: string, target: 'en' | 'ru' = 'en'): string {
  const map = target === 'en' ? HOMOGLYPH_MAP : REVERSE_HOMOGLYPH_MAP;
  return text.split('').map(char => map[char] || char).join('');
}
