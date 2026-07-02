import { Detection } from './types';
import { validateLuhn, validateSNILS, validateINN, validateOGRN, validateIBAN } from './checksums';

export interface Detector {
  type: string;
  detect: (text: string) => Detection[];
}

export const detectors: Detector[] = [
  {
    type: 'EMAIL',
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
      // RU: +7/8 + 10 digits with separators or intl: + and 8-15 digits
      const ruRegex = /(?:\+7|8)(?:(?:\s?\(?\d{3}\)?\s?\d{3}(?:-?\d{2}){2})|(?:\d{10}))/g;
      const intlRegex = /\+\d{8,15}/g;
      const results: Detection[] = [];
      
      for (const regex of [ruRegex, intlRegex]) {
        for (const m of text.matchAll(regex)) {
          results.push({
            type: 'PHONE',
            start: m.index!,
            end: m.index! + m[0].length,
            value: m[0],
            confidence: 'high',
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
        .map(m => ({
          type: 'CARD',
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          confidence: 'high',
          validator: 'checksum'
        }));
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
            const context = text.substring(Math.max(0, m.index! - 30), Math.min(text.length, m.index! + m[0].length + 30));
            if (!/СНИЛС/i.test(context)) return false;
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
          const context = text.substring(Math.max(0, m.index! - 30), Math.min(text.length, m.index! + m[0].length + 30));
          const hasContext = /ИНН/i.test(context);
          return {
            type: 'RU_INN',
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
    type: 'RU_OGRN',
    detect: (text) => {
      const regex = /\b\d{13}\b|\b\d{15}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => validateOGRN(m[0]))
        .map(m => ({
          type: 'RU_OGRN',
          start: m.index!,
          end: m.index! + m[0].length,
          value: m[0],
          confidence: 'high',
          validator: 'checksum'
        }));
    }
  },
  {
    type: 'RU_PASSPORT',
    detect: (text) => {
      const regex = /\b\d{4}[ ]?\d{6}\b/g;
      return Array.from(text.matchAll(regex))
        .filter(m => {
          const context = text.substring(Math.max(0, m.index! - 40), Math.min(text.length, m.index! + m[0].length + 40));
          return /паспорт|серия|выдан/i.test(context);
        })
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
          const context = text.substring(Math.max(0, m.index! - 30), Math.min(text.length, m.index! + m[0].length + 30));
          const hasContext = /полис|ОМС/i.test(context);
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
    detect: (text) => {
      const regex = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
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
