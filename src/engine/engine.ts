import { Detection, EngineConfig, Confidence } from './types';
import { normalize } from './normalize';
import { detectors } from './detectors';
import { secretDetectors } from './secrets';
import { detectPersonRu } from './person_ru';
import { detectPersonEn } from './person_en';

const CONFIDENCE_SCORE: Record<Confidence, number> = {
  'high': 3,
  'medium': 2,
  'low': 1
};

const VALIDATOR_PRIORITY: Record<string, number> = {
  'checksum': 4,
  'secret': 3,
  'format': 2,
  'heuristic': 1
};

export function detect(text: string, config: EngineConfig): Detection[] {
  const normalized = normalize(text);
  let allDetections: Detection[] = [];

  // 1. Run all detectors
  for (const detector of detectors) {
    if (config.enabledTypes.includes(detector.type)) {
      allDetections.push(...detector.detect(text));
    }
  }

  allDetections.push(...secretDetectors.detect(text));

  // Language detection for PERSON
  const cyrillicCount = (text.match(/[а-яё]/gi) || []).length;
  const latinCount = (text.match(/[a-z]/gi) || []).length;
  
  if (config.enabledTypes.includes('PERSON')) {
    const isRu = config.language === 'ru' || (config.language === 'auto' && cyrillicCount > 0);
    if (isRu) {
      const ruDetections = detectPersonRu(text);
      allDetections.push(...ruDetections);
    }
    if (latinCount > 0 && config.language !== 'ru') {
      allDetections.push(...detectPersonEn(text));
    }
  }

  // 2. Filter by confidence
  const minScore = CONFIDENCE_SCORE[config.minConfidence];
  allDetections = allDetections.filter(d => {
    if (d.type === 'PERSON' && d.confidence === 'low') return false; // Default skip low for PERSON
    return CONFIDENCE_SCORE[d.confidence] >= minScore;
  });

  // 3. Merge spans
  allDetections.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const merged: Detection[] = [];
  for (const current of allDetections) {
    if (merged.length === 0) {
      merged.push(current);
      continue;
    }

    const last = merged[merged.length - 1];
    if (current.start < last.end) {
      // Overlap
      const currentLen = current.end - current.start;
      const lastLen = last.end - last.start;

      if (currentLen > lastLen) {
        merged[merged.length - 1] = current;
      } else if (currentLen === lastLen) {
        const currentPrio = VALIDATOR_PRIORITY[current.validator];
        const lastPrio = VALIDATOR_PRIORITY[last.validator];
        if (currentPrio > lastPrio) {
          merged[merged.length - 1] = current;
        }
      }
      // If current is shorter or lower priority, skip it
    } else {
      merged.push(current);
    }
  }

  return merged;
}
