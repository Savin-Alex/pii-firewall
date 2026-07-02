import { Detection } from './types';

export function detectPersonEn(text: string): Detection[] {
  const results: Detection[] = [];

  // (Mr|Mrs|Ms|Dr|Prof) Name
  const titleRegex = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g;
  for (const m of text.matchAll(titleRegex)) {
    results.push({
      type: 'PERSON',
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 'high',
      validator: 'heuristic'
    });
  }

  // Pairs of capitalized words not at start of sentence (simplified)
  const pairRegex = /(?<![.!?]\s)\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g;
  for (const m of text.matchAll(pairRegex)) {
    // Avoid common false positives like "New York" if possible, but for now low confidence
    results.push({
      type: 'PERSON',
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 'low',
      validator: 'heuristic'
    });
  }

  return results;
}
