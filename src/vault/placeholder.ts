/**
 * Placeholder styles. Square brackets are the default because they survive
 * markdown/HTML sanitizers in AI replies (angle brackets do not). Restore is
 * style-agnostic: it matches ANY known style and looks the token up by exact
 * string in the session mapping, so mixing styles never breaks a round-trip.
 */
export type PlaceholderStyle = 'square' | 'curly' | 'guillemet';

const WRAP: Record<PlaceholderStyle, [string, string]> = {
  square: ['[', ']'],
  curly: ['{{', '}}'],
  guillemet: ['«', '»']
};

// Type names are uppercase letters + underscores (RU_INN, SECRET_KV, US_SSN…).
const INNER = '[A-Z_]+_\\d+';

export function formatPlaceholder(type: string, n: number, style: PlaceholderStyle = 'square'): string {
  const [l, r] = WRAP[style];
  return `${l}${type}_${n}${r}`;
}

/** Fresh global-flagged regex that matches a placeholder token in any style. */
export function placeholderPattern(): RegExp {
  return new RegExp(`(\\[${INNER}\\]|\\{\\{${INNER}\\}\\}|«${INNER}»)`, 'g');
}

/** Extracts { type, num } from a placeholder token of any style, or null. */
export function parsePlaceholder(token: string): { type: string; num: number } | null {
  const inner = token.replace(/^[[{«]+/, '').replace(/[\]}»]+$/, '');
  const m = /^([A-Z_]+)_(\d+)$/.exec(inner);
  return m ? { type: m[1], num: parseInt(m[2], 10) } : null;
}
