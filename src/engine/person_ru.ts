import { Detection } from './types';

// ~400 common Russian names (shortened for brevity in this step, but will be expanded)
const COMMON_NAMES = [
  'Александр', 'Александра', 'Алексей', 'Алёна', 'Алина', 'Алиса', 'Анастасия', 'Анатолий', 'Андрей', 'Анна', 'Антон', 'Артём', 'Артур',
  'Борис', 'Вадим', 'Валентин', 'Валентина', 'Валерий', 'Валерия', 'Василий', 'Василиса', 'Вера', 'Вероника', 'Виктор', 'Виктория', 'Виталий', 'Владимир', 'Владислав',
  'Галина', 'Геннадий', 'Георгий', 'Глеб', 'Григорий', 'Даниил', 'Дария', 'Дарья', 'Денис', 'Диана', 'Дмитрий', 'Ева', 'Евгений', 'Евгения', 'Егор', 'Екатерина', 'Елена', 'Елизавета',
  'Жанна', 'Зинаида', 'Зоя', 'Иван', 'Игорь', 'Илья', 'Инна', 'Ирина', 'Кирилл', 'Кристина', 'Ксения', 'Лариса', 'Леонид', 'Лидия', 'Любовь', 'Людмила',
  'Маргарита', 'Марина', 'Мария', 'Марк', 'Матвей', 'Михаил', 'Надежда', 'Наталья', 'Наталия', 'Никита', 'Николай', 'Нина', 'Оксана', 'Олег', 'Олеся', 'Ольга',
  'Павел', 'Полина', 'Раиса', 'Ринат', 'Роман', 'Руслан', 'Светлана', 'Святослав', 'Семён', 'Сергей', 'Снежана', 'София', 'Софья', 'Станислав', 'Степан',
  'Тамара', 'Татьяна', 'Тимофей', 'Тимур', 'Ульяна', 'Фёдор', 'Филипп', 'Юлия', 'Юрий', 'Яна', 'Ярослав'
];

const SURNAME_SUFFIXES = /ов|ова|ев|ева|ин|ина|ын|ский|ская|цкий|цкая|ко|ук|юк|дзе|ян$/;

export function detectPersonRu(text: string): Detection[] {
  const results: Detection[] = [];
  // Match capitalized words, including those with hyphens (e.g., Салтыков-Щедрин)
  const tokens = Array.from(text.matchAll(/\b[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\b/g));

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = token[0];
    
    // 1. Patronymic check (already capitalized by token regex)
    const isPatronymic = /[а-яё]+(?:вич|вна|ична|инична|оглы|кызы)\b/.test(word);
    
    // 2. Triple "Surname Name Patronymic"
    if (isPatronymic && i >= 2) {
      const prev1 = tokens[i-1];
      const prev2 = tokens[i-2];
      
      const dist1 = token.index! - (prev1.index! + prev1[0].length);
      const dist2 = prev1.index! - (prev2.index! + prev2[0].length);
      
      if (dist1 >= 0 && dist1 <= 2 && dist2 >= 0 && dist2 <= 2) {
        results.push({
          type: 'PERSON',
          start: prev2.index!,
          end: token.index! + word.length,
          value: text.substring(prev2.index!, token.index! + word.length),
          confidence: 'high',
          validator: 'heuristic'
        });
        continue;
      }
    }

    // 3. Name from dictionary + surname suffix
    if (COMMON_NAMES.includes(word)) {
      // Check next token for surname
      if (i + 1 < tokens.length) {
        const next = tokens[i+1];
        if (next.index! === token.index! + word.length + 1 && SURNAME_SUFFIXES.test(next[0])) {
          results.push({
            type: 'PERSON',
            start: token.index!,
            end: next.index! + next[0].length,
            value: text.substring(token.index!, next.index! + next[0].length),
            confidence: 'high',
            validator: 'heuristic'
          });
          continue;
        }
      }
      // Check previous token for surname
      if (i > 0) {
        const prev = tokens[i-1];
        if (prev.index! === token.index! - (prev[0].length + 1) && SURNAME_SUFFIXES.test(prev[0])) {
          results.push({
            type: 'PERSON',
            start: prev.index!,
            end: token.index! + word.length,
            value: text.substring(prev.index!, token.index! + word.length),
            confidence: 'high',
            validator: 'heuristic'
          });
          continue;
        }
      }
      
      // Single name
      results.push({
        type: 'PERSON',
        start: token.index!,
        end: token.index! + word.length,
        value: word,
        confidence: 'medium',
        validator: 'heuristic'
      });
    }
  }

  // 4. Initials: "Фамилия И.О." or "И.О. Фамилия"
  const initialsRegex = /\b[А-ЯЁ][а-яё]+\s[А-ЯЁ]\.\s?[А-ЯЁ]\.|\b[А-ЯЁ]\.\s?[А-ЯЁ]\.\s[А-ЯЁ][а-яё]+\b/g;
  for (const m of text.matchAll(initialsRegex)) {
    results.push({
      type: 'PERSON',
      start: m.index!,
      end: m.index! + m[0].length,
      value: m[0],
      confidence: 'high',
      validator: 'heuristic'
    });
  }

  return results;
}
