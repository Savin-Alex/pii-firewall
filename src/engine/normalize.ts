/**
 * Unicode NFKC normalization and combining marks removal.
 * Homoglyph mapping for identifier validation.
 */

export interface NormalizedText {
  text: string;
  originalStart: number[];
  originalEnd: number[];
}

export function normalize(text: string): string {
  return normalizeWithMap(text).text;
}

export function normalizeWithMap(text: string): NormalizedText {
  let normalized = '';
  const originalStart: number[] = [];
  const originalEnd: number[] = [];

  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    const charLength = codePoint && codePoint > 0xffff ? 2 : 1;
    const segment = text
      .slice(index, index + charLength)
      .normalize('NFKC')
      .replace(/[\u0300-\u036f]/g, '');

    for (let offset = 0; offset < segment.length; offset++) {
      originalStart.push(index);
      originalEnd.push(index + charLength);
    }

    normalized += segment;
    index += charLength;
  }

  return { text: normalized, originalStart, originalEnd };
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
