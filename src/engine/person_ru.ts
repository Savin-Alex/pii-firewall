import { Detection } from './types';

// Seed list of common Russian given names for the heuristic PERSON detector.
// Nominative forms; matching is stem-based, so declined forms are covered too.
const COMMON_NAMES = [
  'Александр', 'Александра', 'Алексей', 'Алёна', 'Алена', 'Алина', 'Алиса', 'Анастасия', 'Анатолий', 'Андрей', 'Анна', 'Антон', 'Артём', 'Артем', 'Артур',
  'Борис', 'Вадим', 'Валентин', 'Валентина', 'Валерий', 'Валерия', 'Василий', 'Василиса', 'Вера', 'Вероника', 'Виктор', 'Виктория', 'Виталий', 'Владимир', 'Владислав',
  'Галина', 'Геннадий', 'Георгий', 'Глеб', 'Григорий', 'Даниил', 'Дария', 'Дарья', 'Денис', 'Диана', 'Дмитрий', 'Ева', 'Евгений', 'Евгения', 'Егор', 'Екатерина', 'Елена', 'Елизавета',
  'Жанна', 'Зинаида', 'Зоя', 'Иван', 'Игорь', 'Илья', 'Инна', 'Ирина', 'Кирилл', 'Кристина', 'Ксения', 'Лариса', 'Леонид', 'Лидия', 'Любовь', 'Людмила',
  'Маргарита', 'Марина', 'Мария', 'Марк', 'Матвей', 'Михаил', 'Надежда', 'Наталья', 'Наталия', 'Никита', 'Николай', 'Нина', 'Оксана', 'Олег', 'Олеся', 'Ольга',
  'Павел', 'Петр', 'Пётр', 'Полина', 'Раиса', 'Ринат', 'Роман', 'Руслан', 'Светлана', 'Святослав', 'Семён', 'Семен', 'Сергей', 'Снежана', 'София', 'Софья', 'Станислав', 'Степан',
  'Тамара', 'Татьяна', 'Тимофей', 'Тимур', 'Ульяна', 'Фёдор', 'Федор', 'Филипп', 'Юлия', 'Юрий', 'Яна', 'Ярослав',
  // Diminutives
  'Саша', 'Шура', 'Лёша', 'Леша', 'Алеша', 'Настя', 'Андрюша', 'Аня', 'Тёма', 'Тема',
  'Вася', 'Вика', 'Володя', 'Вова', 'Галя', 'Гриша', 'Даня', 'Даша', 'Женя', 'Катя',
  'Лена', 'Лиза', 'Ваня', 'Гоша', 'Ира', 'Кира', 'Костя', 'Ксюша', 'Люба', 'Люда',
  'Рита', 'Маша', 'Миша', 'Надя', 'Наташа', 'Коля', 'Оля', 'Паша', 'Петя', 'Поля',
  'Света', 'Сеня', 'Серёжа', 'Сережа', 'Соня', 'Стас', 'Таня', 'Тима', 'Уля', 'Федя',
  'Юля', 'Юра', 'Слава', 'Дима', 'Максим', 'Макс', 'Лев', 'Ангелина', 'Арина', 'Богдан',
  'Варвара', 'Варя', 'Герман', 'Злата', 'Карина', 'Лилия', 'Милана', 'Мирон', 'Платон', 'Тихон',
  'Эльвира', 'Эмилия', 'Юлиана', 'Ярослава'
];

// Case endings a given-name token may carry (longest first for greedy stripping).
const NAME_ENDINGS = ['ией', 'ьей', 'ьёй', 'ями', 'ами', 'ой', 'ей', 'ёй', 'ом', 'ем', 'ём', 'ии', 'ию', 'ье', 'ьи', 'ью', 'а', 'я', 'у', 'ю', 'е', 'и', 'ы', 'й', 'ь', 'о'];

function nameStem(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('ия')) return lower.slice(0, -1);
  if (/[аяйьоеи]$/.test(lower)) return lower.slice(0, -1);
  return lower;
}

const NAME_STEMS = new Set(COMMON_NAMES.map(nameStem));

function isKnownName(word: string): boolean {
  const lower = word.toLowerCase();
  if (NAME_STEMS.has(lower)) return true;
  for (const ending of NAME_ENDINGS) {
    if (lower.length - ending.length >= 2 && lower.endsWith(ending) && NAME_STEMS.has(lower.slice(0, -ending.length))) {
      return true;
    }
  }
  return false;
}

// Surname suffixes incl. declined forms: Иванов(а|у|ой|ым|е|ых), Достоевск(ий|ого|ому|им|ом|ая|ой|ую), Петросян(а|у|ом|е)...
const SURNAME_SUFFIXES = /(?:[оеё]в(?:а|у|е|ой|ою|ым|ы|ых)?|[иы]н(?:а|у|е|ой|ою|ым|ы|ых)?|[сц]к(?:ий|ого|ому|им|ом|ая|ой|ою|ую|ие|их)|ко|ук|юк|дзе|ян(?:а|у|ом|е)?)$/i;
// Patronymic suffixes incl. declined forms: Иванович(а|у|ем|е), Сергеевн(а|ы|е|у|ой), Ильиничн(а|ы|е|у|ой), оглы/кызы indeclinable.
const PATRONYMIC_SUFFIXES = /(?:вич(?:а|у|ем|е)?|вн(?:а|ы|е|у|ой|ою)|ичн(?:а|ы|е|у|ой|ою)|оглы|кызы)$/i;

export function detectPersonRu(text: string): Detection[] {
  const results: Detection[] = [];
  // Match capitalized words, including those with hyphens (e.g., Салтыков-Щедрин).
  // No \b here: JS word boundaries are ASCII-only (\w excludes Cyrillic), so \b
  // never fires inside Russian text. The lookbehind is the Unicode-aware boundary.
  const tokens = Array.from(text.matchAll(/(?<![А-ЯЁа-яёA-Za-z])[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?/gu));

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = token[0];

    // 1. Patronymic check (already capitalized by token regex)
    const isPatronymic = PATRONYMIC_SUFFIXES.test(word);

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

    // 3. Name from dictionary (stem match covers declined forms) + surname suffix
    if (isKnownName(word)) {
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
  const initialsRegex = /[А-ЯЁ][а-яё]+\s[А-ЯЁ]\.\s?[А-ЯЁ]\.|[А-ЯЁ]\.\s?[А-ЯЁ]\.\s[А-ЯЁ][а-яё]+/g;
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
