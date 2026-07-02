import { Detection, EngineConfig, Confidence } from './types';
import { NormalizedText, normalizeWithMap, canonicalizeHomoglyphs } from './normalize';
import { detectors } from './detectors';
import { secretDetectors } from './secrets';
import { detectPersonRu } from './person_ru';
import { detectPersonEn } from './person_en';

const CONFIDENCE_SCORE: Record<Confidence, number> = {
  'high': 3,
  'medium': 2,
  'low': 1
};

const TYPE_PRIORITY: Record<string, number> = {
  'RU_SNILS': 20,
  'RU_INN': 20,
  'RU_OGRN': 20,
  'RU_PASSPORT': 20,
  'IBAN': 20,
  'CARD': 10
};

export function detect(text: string, config: EngineConfig): Detection[] {
  const normalized = normalizeWithMap(text);
  const scanText = normalized.text;
  // Homoglyph folding is 1:1 per char, so folded offsets equal normalized offsets.
  const foldedText = canonicalizeHomoglyphs(scanText, 'en');
  let allDetections: Detection[] = [];

  // 1. Run all detectors on the view(s) they declare
  for (const detector of detectors) {
    if (config.enabledTypes.includes(detector.type)) {
      const views = detector.scanView === 'folded' ? [foldedText]
        : detector.scanView === 'both' ? [scanText, foldedText]
        : [scanText];
      const detections = dedupeBySpan(views.flatMap(view => detector.detect(view)));
      allDetections.push(...remapDetections(detections, text, normalized));
    }
  }

  if (shouldRunSecretDetectors(config)) {
    // Both views: Latin key patterns need folding, the Cyrillic "пароль" cue does not survive it.
    const secretDetections = dedupeBySpan([scanText, foldedText].flatMap(view => secretDetectors.detect(view)))
      .filter(d => config.enabledTypes.includes('SECRET') || config.enabledTypes.includes(d.type));
    allDetections.push(...remapDetections(secretDetections, text, normalized));
  }

  // Language detection for PERSON
  const cyrillicCount = (scanText.match(/[а-яё]/gi) || []).length;
  const latinCount = (scanText.match(/[a-z]/gi) || []).length;
  
  if (config.enabledTypes.includes('PERSON')) {
    const isRu = config.language === 'ru' || (config.language === 'auto' && cyrillicCount > 0);
    if (isRu) {
      allDetections.push(...remapDetections(detectPersonRu(scanText), text, normalized));
    }
    if (latinCount > 0 && config.language !== 'ru') {
      allDetections.push(...remapDetections(detectPersonEn(scanText), text, normalized));
    }
  }

  // 2. Filter by confidence
  const minScore = CONFIDENCE_SCORE[config.minConfidence];
  allDetections = allDetections.filter(d => CONFIDENCE_SCORE[d.confidence] >= minScore);

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
        const currentPrio = detectionPriority(current);
        const lastPrio = detectionPriority(last);
        if (
          currentPrio > lastPrio ||
          (currentPrio === lastPrio && CONFIDENCE_SCORE[current.confidence] > CONFIDENCE_SCORE[last.confidence])
        ) {
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

function dedupeBySpan(detections: Detection[]): Detection[] {
  const seen = new Set<string>();
  return detections.filter(d => {
    const key = `${d.type}:${d.start}:${d.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldRunSecretDetectors(config: EngineConfig): boolean {
  return config.enabledTypes.includes('SECRET') || config.enabledTypes.some(isSecretType);
}

function isSecretType(type: string): boolean {
  return type === 'SECRET' || type.startsWith('SECRET_');
}

function detectionPriority(detection: Detection): number {
  const typePriority = getTypePriority(detection);

  if (detection.validator === 'checksum') return 400 + typePriority;
  if (isSecretType(detection.type)) return 300 + typePriority;
  if (detection.type === 'PERSON') return 100;
  return 200 + typePriority;
}

function getTypePriority(detection: Detection): number {
  if (detection.type === 'RU_OMS') {
    return detection.confidence === 'high' ? 20 : 0;
  }

  return TYPE_PRIORITY[detection.type] ?? 0;
}

function remapDetections(
  detections: Detection[],
  originalText: string,
  normalized: NormalizedText
): Detection[] {
  return detections
    .map(detection => remapDetection(detection, originalText, normalized))
    .filter((detection): detection is Detection => detection !== null);
}

function remapDetection(
  detection: Detection,
  originalText: string,
  normalized: NormalizedText
): Detection | null {
  if (detection.start < 0 || detection.end <= detection.start) return null;

  const start = normalized.originalStart[detection.start];
  const end = normalized.originalEnd[detection.end - 1];
  if (start === undefined || end === undefined) return null;

  return {
    ...detection,
    start,
    end,
    value: originalText.slice(start, end)
  };
}
