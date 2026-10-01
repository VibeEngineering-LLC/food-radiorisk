/**
 * @param {string|null|undefined} u - Unit string in English or mixed notation.
 * @returns {string} Translated unit string in Russian.
 */
export function unitRu(u) {
  if (u == null || u === '') return '';

  const s = String(u).trim();

  // Exact-match table
  const exactMap = {
    'dimensionless': 'безразм.',
    '% of fresh mass': '% сырой массы',
    'fraction of carcass weight': 'доля массы туши',
    '% of daily ration intake per 1 kg (L) of product': '% суточного поступления на 1 кг (л) продукта',
    'y': 'лет',
    'd': 'сут',
    'h': 'ч',
    'min': 'мин',
    'm': 'м'
  };

  if (s in exactMap) {
    return exactMap[s];
  }

  // Prefix checks
  if (s.startsWith('unit NOT stated')) {
    return 'единица в источнике не указана; принято (Бк/кг)/(кБк/м²) = 10⁻³ м²/кг';
  }
  if (s.startsWith('NOT ESTABLISHED')) {
    return 'не установлено';
  }
  if (s.startsWith('m2/kg (values given as n*1e-3')) {
    return 'м²/кг (в источнике — n·10⁻³ м²/кг)';
  }

  // Check for Cyrillic presence and absence of Latin letters to skip processing if already translated
  const hasCyrillic = /[а-яё]/i.test(s);
  const hasLatin = /[A-Za-z]/.test(s);

  if (hasCyrillic && !hasLatin) {
    return s;
  }

  // Token replacement with word boundaries
  // Order matters: longer/more specific tokens first to avoid partial matches (e.g., kBq before Bq, m2 before m)
  const replacements = [
    ['kBq', 'кБк'],
    ['Bq', 'Бк'],
    ['mSv', 'мЗв'],
    ['nSv', 'нЗв'],
    ['Sv', 'Зв'],
    ['nGy', 'нГр'],
    ['kg', 'кг'],
    ['cm2', 'см²'],
    ['m2', 'м²'],
    ['m3', 'м³'],
    ['L', 'л'],
    ['yr', 'год'],
    ['day', 'сут'],
    ['d', 'сут'],
    ['h', 'ч'],
    ['g', 'г']
  ];

  let result = s;
  for (const [pattern, replacement] of replacements) {
    // Use lookbehind and lookahead to ensure word boundaries without consuming characters
    // (?<![A-Za-z]) ensures no letter before
    // (?![A-Za-z0-9]) ensures no alphanumeric after
    const regex = new RegExp(`(?<![A-Za-z])${pattern}(?![A-Za-z0-9])`, 'g');
    result = result.replace(regex, replacement);
  }

  return result;
}

/**
 * @param {string|null|undefined} loc - Location string in English with internal notes.
 * @returns {string} Cleaned and translated location string in Russian.
 */
export function locRu(loc) {
  if (typeof loc !== 'string' || loc === '') return '';

  let s = loc;

  // STEP A: Remove internal working notes

  // 1. Remove parenthesised groups containing md/txt references and preceding whitespace
  s = s.replace(/\s*\([^()]*(?:\.?md\b|md line|\.txt\b)[^()]*\)/gi, '');

  // 2. Номера строк .md вырезаются ДО отбора сегментов, иначе «Атлас МЧС 2009, .md lines …» выпадает целиком
  s = s.replace(/,?\s*(?:djvu\s*)?\.?md lines? [\d\s,–-]+/gi, '');

  // 3. Split by ';', drop segments with internal file refs, rejoin
  const segments = s.split(';');
  const keptSegments = segments.filter(seg => {
    return !/\.md\b|\.txt\b|djvu|complexdoc|local copy|grep\b|библиотека оператора/i.test(seg);
  });
  s = keptSegments.join('; ');

  // 4. Trim, collapse spaces, remove leading/trailing punctuation
  s = s.trim();
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/^[,;\s]+|[,;\s]+$/g, '');

  if (s === '') return '';

  // STEP B: Translate terms
  // Order matters for overlapping patterns (e.g., TRS-472 book p. vs book p.)

  const translations = [
    [/TRS-472 book p\.\s*/g, 'с. '],
    [/book p\.\s*/g, 'с. '],
    [/printed p\.\s*/g, 'с. '],
    [/PDF p\.\s*/g, 'с. PDF '],
    [/pp?\.\s*(?=\d)/g, 'с. '],
    [/\bTables?\b/gi, 'табл.'],
    [/\(cont\.\)/g, '(продолж.)'],
    [/\bcont\./g, 'продолж.'],
    [/\b[Ss]ections?\b/g, 'разд.'],
    [/\bAnnex\b/g, 'прил.'],
    [/\bSchedule\b/g, 'прил.'],
    [/\bVol\.\s*/g, 'т. '],
    [/\bparas\b/g, 'пп.'],
    [/\bpara\b/g, 'п.'],
    [/\bArticle\b/g, 'ст.'],
    [/\bfootnote\b/g, 'сноска'],
    [/\bcolumns\b/g, 'столбцы'],
    [/\bcolumn\b/g, 'столбец'],
    [/\brow\b/g, 'строка'],
    [/\bchart\b/g, 'диаграмма'],
    [/\bslide\b/gi, 'слайд'],
    [/\bEq\.\s*/g, 'формула '],
    [/\bRequirement\b/g, 'требование'],
    [/\bCORRIGENDUM to\b/gi, 'исправление к'],
    [/\bcorrigendum\b/gi, 'исправление'],
    [/\breplacement of\b/g, 'замена'],
    [/\bafter\b/g, 'после'],
    [/\bPDF page not identified\b/g, 'страница PDF не установлена'],
    [/\(scanned PDF\)/g, '(скан)'],
    [/\bearly years\b/g, 'первые годы'],
    [/\bremote period\b/g, 'отдалённый период'],
    [/\bet al\.?/g, 'и др.']
  ];

  for (const [pattern, replacement] of translations) {
    s = s.replace(pattern, replacement);
  }
  return tidyLoc(s);
}

// STEP C (#FR-22): служебные пометки .doc/.docx/complexdoc/txt; английские уточнения; ведущие «автор, название» латиницей —
// документ уже назван в столбце «Источник», в месте оставляем только таблицу/страницу
const EXTRA = [[/\s*\([^()]*(?:\.docx?\b|docx-|complexdoc|\btxt\b)[^()]*\)?/gi, ''], [/;?\s*\.docx? строка[^;]*/g, ''], [/PDF \(complexdoc\) /g, 'PDF '],
  [/plane source, beta = infinity/g, 'плоский источник, β = ∞'], [/uniform layer/g, 'равномерный слой'], [/meadow plots, June/g, 'луговые участки, июнь'],
  [/\bsource \[/g, 'первичный источник ['], [/NCRP parameters/g, 'параметры NCRP'], [/RESRAD 6 Manual App\. /g, 'руководство RESRAD 6, прил. '], [/\bpoint\b/g, 'пункт']];
function tidyLoc(s) {
  for (const [p, r] of EXTRA) s = s.replace(p, r);
  const parts = s.split(', ');
  const isLocator = (c) => /[а-яё]/i.test(c.replace(/и др\./g, '')) || /^\d|^\(|PDF/.test(c);
  while (parts.length > 1 && !isLocator(parts[0])) parts.shift();
  // « and » в перечне авторов — после отбрасывания английского названия, иначе название рвётся на куски
  return parts.join(', ').replace(/ and /g, ', ').replace(/^[,;\s]+|[,;\s]+$/g, '');
}

/**
 * @param {string} s - The string to check for untranslated Latin words.
 * @returns {string[]} Array of Latin words remaining in the string.
 */
export function latinLeft(s) {
  const exclusions = new Set([
    'PDF', 'TRS', 'TECDOC', 'SRS', 'ICRP', 'IAEA', 'UNSCEAR', 'NUBASE', 'ENSDF', 'DDEP'
  ]);

  const matches = s.match(/[A-Za-z]{3,}/g);
  if (!matches) return [];

  return matches.filter(word => !exclusions.has(word.toUpperCase()));
}
