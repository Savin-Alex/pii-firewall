import { describe, it, expect } from 'vitest';
import { detect } from '../src/engine/engine';
import { Detection } from '../src/engine/types';
import { EngineConfig } from '../src/engine/types';
import corpus from './corpus/synthetic-corpus.json';

const config: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'US_SSN', 'IP_ADDRESS', 'PERSON', 'SECRET'],
  minConfidence: 'medium',
  language: 'auto'
};

interface ExpectedDetection {
  type: string;
  value: string;
}

interface CorpusItem {
  text: string;
  expected: ExpectedDetection[];
}

describe('Corpus Precision/Recall', () => {
  it('should pass synthetic corpus tests', () => {
    let structuredExpected = 0;
    let structuredDetected = 0;
    let structuredTruePositives = 0;
    let personExpected = 0;
    let personTruePositives = 0;

    for (const item of corpus as CorpusItem[]) {
      const results = detect(item.text, config);
      const expectedStructured = item.expected.filter(e => e.type !== 'PERSON');
      const detectedStructured = results.filter(r => r.type !== 'PERSON');
      const expectedPersons = item.expected.filter(e => e.type === 'PERSON');

      structuredExpected += expectedStructured.length;
      structuredDetected += detectedStructured.length;
      structuredTruePositives += countMatches(expectedStructured, detectedStructured);
      personExpected += expectedPersons.length;
      personTruePositives += countMatches(expectedPersons, results);
    }

    const structuredPrecision = structuredTruePositives / structuredDetected;
    const structuredRecall = structuredTruePositives / structuredExpected;
    const personRecall = personTruePositives / personExpected;

    console.table({ structuredPrecision, structuredRecall, personRecall });

    expect(structuredPrecision).toBeGreaterThanOrEqual(0.98);
    expect(structuredRecall).toBeGreaterThanOrEqual(0.95);
    expect(personRecall).toBeGreaterThanOrEqual(0.65);
  });
});

function countMatches(expected: ExpectedDetection[], detected: Detection[]): number {
  const remaining = [...detected];
  let matches = 0;

  for (const expectedDetection of expected) {
    const index = remaining.findIndex(detection =>
      detection.type === expectedDetection.type &&
      detection.value === expectedDetection.value
    );

    if (index !== -1) {
      matches++;
      remaining.splice(index, 1);
    }
  }

  return matches;
}
