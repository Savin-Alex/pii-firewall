import { Detection } from './types';

export const secretDetectors = {
  detect: (text: string): Detection[] => {
    const results: Detection[] = [];

    // JWT
    const jwtRegex = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
    for (const m of text.matchAll(jwtRegex)) {
      results.push({ type: 'SECRET_JWT', start: m.index!, end: m.index! + m[0].length, value: m[0], confidence: 'high', validator: 'format' });
    }

    // AWS KEY
    const awsRegex = /\bAKIA[0-9A-Z]{16}\b/g;
    for (const m of text.matchAll(awsRegex)) {
      results.push({ type: 'SECRET_AWS', start: m.index!, end: m.index! + m[0].length, value: m[0], confidence: 'high', validator: 'format' });
    }

    // KV_SECRET
    const kvRegex = /(?:api[_-]?key|apikey|token|secret|password|пароль)\s*[:=]\s*(?:"([^"]{8,})"|'([^']{8,})'|(\S{8,}))/gi;
    for (const m of text.matchAll(kvRegex)) {
      const fullMatch = m[0];
      const secretValue = m[1] || m[2] || m[3];
      const valueStart = fullMatch.indexOf(secretValue);
      results.push({
        type: 'SECRET_KV',
        start: m.index! + valueStart,
        end: m.index! + valueStart + secretValue.length,
        value: secretValue,
        confidence: 'high',
        validator: 'format'
      });
    }

    // HIGH_ENTROPY. Hex alphabet caps Shannon entropy at exactly 4.0 bits,
    // so hex strings get their own threshold; base64-like keeps 4.0.
    const entropyRegex = /\b[A-Za-z0-9+/]{32,}\b/g;
    for (const m of text.matchAll(entropyRegex)) {
      const isHex = /^[a-f0-9]+$/i.test(m[0]);
      const threshold = isHex ? 3.3 : 4.0;
      // Git SHAs and file checksums are random hex too — skip explicitly labeled ones.
      if (isHex && /(?:commit|sha-?\d*|hash|md5|checksum|хеш|коммит)[\s:=#"'«]*$/i.test(text.substring(Math.max(0, m.index! - 20), m.index!))) {
        continue;
      }
      if (calculateEntropy(m[0]) > threshold) {
        results.push({ type: 'SECRET_ENTROPY', start: m.index!, end: m.index! + m[0].length, value: m[0], confidence: 'medium', validator: 'heuristic' });
      }
    }

    return results;
  }
};

function calculateEntropy(str: string): number {
  const len = str.length;
  const frequencies: Record<string, number> = {};
  for (const char of str) frequencies[char] = (frequencies[char] || 0) + 1;
  return Object.values(frequencies).reduce((sum, f) => {
    const p = f / len;
    return sum - p * Math.log2(p);
  }, 0);
}
