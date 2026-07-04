import { Detection } from './types';

// Common capitalized words that form non-name bigrams — if EITHER word of a pair
// is here, it's almost certainly a place/org/date/greeting, not a person.
const STOPWORDS = new Set([
  // places
  'New', 'York', 'Los', 'Angeles', 'San', 'Francisco', 'Diego', 'Jose', 'Antonio',
  'Las', 'Vegas', 'United', 'States', 'Kingdom', 'North', 'South', 'East', 'West',
  'Great', 'Britain', 'Hong', 'Kong', 'Sri', 'Lanka', 'Costa', 'Rica', 'Puerto', 'Rico',
  'Saudi', 'Arabia', 'South', 'Africa', 'Middle', 'Silicon', 'Valley', 'Wall', 'Street',
  // org / business
  'LLC', 'Inc', 'Corp', 'Ltd', 'Company', 'Group', 'Team', 'Project', 'Data',
  'Systems', 'Solutions', 'Technologies', 'Services', 'Holdings', 'Partners', 'Labs',
  'Machine', 'Learning', 'Artificial', 'Intelligence', 'Open', 'Source',
  // time
  'January', 'February', 'March', 'April', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
  'Friday', 'Saturday', 'Sunday',
  // greetings / filler
  'Best', 'Regards', 'Kind', 'Dear', 'Hello', 'Thank', 'Thanks', 'Please', 'Note'
]);

export function detectPersonEn(text: string): Detection[] {
  const results: Detection[] = [];

  // (Mr|Mrs|Ms|Dr|Prof) Name — strongest signal.
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

  // Pairs of capitalized words not at start of sentence. 'medium' so bare names
  // ("John Smith") mask at the default threshold; the stoplist blocks the most
  // common place/org/date bigrams to keep the noise down.
  const pairRegex = /(?<![.!?]\s)\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g;
  for (const m of text.matchAll(pairRegex)) {
    const [first, second] = m[0].split(/\s+/);
    if (STOPWORDS.has(first) || STOPWORDS.has(second)) continue;
    results.push({
      type: 'PERSON',
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 'medium',
      validator: 'heuristic'
    });
  }

  return results;
}
