import { Detection, Confidence } from './types';
import { validateLuhn, validateSNILS, validateINN, validateOGRN, validateIBAN } from './checksums';

export interface Detector {
  type: string;
  // Which text view to scan: homoglyph-folded (Latin patterns), normalized (Cyrillic context cues), or both.
  scanView?: 'normalized' | 'folded' | 'both';
  detect: (text: string) => Detection[];
}

function context(text: string, index: number, length: number, radius: number): string {
  return text.substring(Math.max(0, index - radius), Math.min(text.length, index + length + radius));
}

export const detectors: Detector[] = [
  {
    type: 'EMAIL',
    scanView: 'folded',
    detect: (text) => {
      const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      return Array.from(text.matchAll(regex)).map(m => ({
        type: 'EMAIL',
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        confidence: 'high',
        validator: 'format'
      }));
    }
  },
  {
    type: 'PHONE',
    detect: (text) => {
      // RU: +7/8 + 10 digits with space/hyphen/paren separators; intl: + and 8-15 digits.
      // Digit lookarounds keep matches out of longer digit runs (card numbers, IBAN tails).
      const ruRegex = /(?<!\d)(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g;
      const intlRegex = /(?<![\d+])\+(?:\d[\s-]?){7,14}\d(?!\d)/g;
      const results: Detection[] = [];
      const seen = new Set<string>();

      for (const regex of [ruRegex, intlRegex]) {
        for (const m of text.matchAll(regex)) {
          const key = `${m.index}:${m[0].length}`;
          if (seen.has(key)) continue;
          seen.add(key);
          // Bare 8xxxxxxxxxx has no format cue and collides with article/order numbers.
          const formatCued = m[0].startsWith('+') || /[\s()-]/.test(m[0]);
          results.push({
            type: 'PHONE',
            start: m.index!,
            end: m.index! + m[0].length,
            value: m[0],
            confidence: formatCued ? 'high' : 'medium',
            validator: 'format'
          });
        }
      }
      return results;
    }
  },
  {
    type: 'CARD',
    detect: (text) => {
      const regex = /\b(?:\d[ -]?){12,18}\d\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => {
          const digits = m[0].replace(/\D/g, '');
          return digits.length >= 13 && digits.length <= 19 && validateLuhn(digits) && !/^(\d)\1+$/.test(digits);
        })
        .map(m => {
          // Random digit runs pass Luhn with ~10% probability, so an unformatted
          // match without payment context is weak evidence.
          const digits = m[0].replace(/\D/g, '');
          const grouped = /[ -]/.test(m[0]);
          const hasContext = /карт|card|visa|master|мир|amex|maestro|плат[её]ж|оплат|сч[её]т/i.test(context(text, m.index!, m[0].length, 30));
          let confidence: Confidence;
          if (grouped || hasContext) confidence = 'high';
          else confidence = digits.length === 16 ? 'medium' : 'low';
          return {
            type: 'CARD',
            start: m.index!,
            end: m.index! + m[0].length,
            value: m[0],
            confidence,
            validator: 'checksum' as const
          };
        });
    }
  },
  {
    type: 'RU_SNILS',
    detect: (text) => {
      const regex = /\b\d{3}-\d{3}-\d{3}[ -]?\d{2}\b|\b\d{11}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => {
          const val = m[0];
          if (val.length === 11 && !val.includes('-')) {
            if (!/СНИЛС/i.test(context(text, m.index!, val.length, 30))) return false;
          }
          return validateSNILS(val);
        })
        .map(m => ({
          type: 'RU_SNILS',
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          confidence: 'high',
          validator: 'checksum'
        }));
    }
  },
  {
    type: 'RU_INN',
    detect: (text) => {
      const regex = /\b\d{10}\b|\b\d{12}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => validateINN(m[0]))
        .map(m => {
          const hasContext = /ИНН/i.test(context(text, m.index!, m[0].length, 30));
          // A random 10-digit number passes the checksum with ~9% probability;
          // the 12-digit double check is ~0.8%, so it stays visible without context.
          let confidence: Confidence;
          if (hasContext) confidence = 'high';
          else confidence = m[0].length === 12 ? 'medium' : 'low';
          return {
            type: 'RU_INN',
            start: m.index!,
            end: m.index! + m[0].length,
            value: m[0],
            confidence,
            validator: 'checksum' as const
          };
        });
    }
  },
  {
    type: 'RU_OGRN',
    detect: (text) => {
      const regex = /\b\d{13}\b|\b\d{15}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => validateOGRN(m[0]))
        .map(m => {
          // Single mod-11/13 digit passes on ~9% of random numbers; real OGRNs
          // are practically always labeled in documents.
          const hasContext = /ОГРН/i.test(context(text, m.index!, m[0].length, 30));
          return {
            type: 'RU_OGRN',
            start: m.index!,
            end: m.index! + m[0].length,
            value: m[0],
            confidence: hasContext ? 'high' : 'low' as Confidence,
            validator: 'checksum' as const
          };
        });
    }
  },
  {
    type: 'RU_PASSPORT',
    detect: (text) => {
      const regex = /\b\d{4}[ ]?\d{6}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => /паспорт|серия|выдан/i.test(context(text, m.index!, m[0].length, 40)))
        .map(m => ({
          type: 'RU_PASSPORT',
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          confidence: 'medium',
          validator: 'format'
        }));
    }
  },
  {
    type: 'RU_OMS',
    detect: (text) => {
      const regex = /\b\d{16}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => validateLuhn(m[0]))
        .map(m => {
          const hasContext = /полис|ОМС/i.test(context(text, m.index!, m[0].length, 30));
          return {
            type: 'RU_OMS',
            start: m.index!,
            end: m.index! + m[0].length,
            value: m[0],
            confidence: hasContext ? 'high' : 'medium',
            validator: 'checksum'
          };
        });
    }
  },
  {
    type: 'IBAN',
    scanView: 'folded',
    detect: (text) => {
      const regex = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => validateIBAN(m[0]))
        .map(m => ({
          type: 'IBAN',
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          confidence: 'high',
          validator: 'checksum'
        }));
    }
  },
  {
    type: 'US_SSN',
    detect: (text) => {
      const regex = /(?<!\d)(\d{3})-(\d{2})-(\d{4})(?!\d)/g;
      return Array.from(text.matchAll(regex))
        .filter(m => {
          const [, area, group, serial] = m;
          if (area === '000' || area === '666' || area >= '900') return false;
          if (group === '00' || serial === '0000') return false;
          return true;
        })
        .map(m => ({
          type: 'US_SSN',
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          confidence: 'high',
          validator: 'format'
        }));
    }
  },
  {
    // Opt-in: not part of default enabled types — plain dd.mm.yyyy dates are too noisy.
    type: 'DATE_OF_BIRTH',
    detect: (text) => {
      const regex = /(?<!\d)(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19|20)\d{2}(?!\d)/g;
      return Array.from(text.matchAll(regex)).map(m => {
        const hasContext = /рожден|г\.\s?р|д\.\s?р|birth|born/i.test(context(text, m.index!, m[0].length, 40));
        return {
          type: 'DATE_OF_BIRTH',
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          confidence: hasContext ? 'high' : 'medium' as Confidence,
          validator: 'format' as const
        };
      });
    }
  },
  {
    type: 'IP_ADDRESS',
    detect: (text) => {
      const ipv4 = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
      return Array.from(text.matchAll(ipv4)).map(m => ({
        type: 'IP_ADDRESS',
        start: m.index!,
        end: m.index! + m[0].length,
        value: m[0],
        confidence: 'medium',
        validator: 'format'
      }));
    }
  }
];
