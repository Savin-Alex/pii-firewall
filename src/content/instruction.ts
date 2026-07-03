/**
 * The model instruction appended after masking. Kept in one place so both the
 * widget and the guard stay idempotent, and restore can strip it BEFORE the
 * vault pass — the sentence itself contains a literal [PERSON_1] example that
 * must never be substituted with a real value.
 */
const SENTENCE = 'Сохраняй метки в квадратных скобках вида [PERSON_1] в ответе без изменений.';

export function appendInstruction(text: string): string {
  if (text.includes(SENTENCE)) return text;
  return text + '\n\n' + SENTENCE;
}

export function stripInstruction(text: string): string {
  if (!text.includes(SENTENCE)) return text;
  return text.split(SENTENCE).join('').replace(/\n{3,}/g, '\n\n').trimEnd();
}
