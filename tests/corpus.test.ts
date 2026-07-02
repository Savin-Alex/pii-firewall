import { describe, it, expect } from 'vitest';
import { detect } from '../src/engine/engine';
import { EngineConfig } from '../src/engine/types';
import corpus from './corpus/synthetic-corpus.json';

const config: EngineConfig = {
  enabledTypes: ['EMAIL', 'PHONE', 'CARD', 'RU_SNILS', 'RU_INN', 'RU_OGRN', 'RU_PASSPORT', 'RU_OMS', 'IBAN', 'IP_ADDRESS', 'PERSON'],
  minConfidence: 'medium',
  language: 'auto'
};

describe('Corpus Precision/Recall', () => {
  it('should pass synthetic corpus tests', () => {
    let totalExpected = 0;
    let totalDetected = 0;
    let truePositives = 0;

    for (const item of corpus) {
      const results = detect(item.text, config);
      const detectedTypes = results.map(r => r.type);
      
      totalExpected += item.expected.length;
      totalDetected += detectedTypes.length;

      item.expected.forEach(exp => {
        if (detectedTypes.includes(exp)) {
          truePositives++;
        }
      });
    }

    const precision = truePositives / totalDetected;
    const recall = truePositives / totalExpected;

    console.table({ precision, recall });

    expect(precision).toBeGreaterThan(0.8);
    expect(recall).toBeGreaterThan(0.7);
  });
});
