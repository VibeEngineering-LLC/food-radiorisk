import { esc } from './fmt.js';
import { SOURCE_SHORT } from './form.js';
import SOURCES from '../../public/data/sources.json' with { type: 'json' };
// полное описание источника из реестра (#FR-24): авторы. Название. Выходные данные, год — текстом; одна ссылка на страницу документов стоит над таблицей
export function sourceFull(code) {
  if (!code) return '';
  let r = SOURCES.sources[code];
  if (r?.same_as) r = SOURCES.sources[r.same_as] || r;
  if (!r || !r.title_ru) return esc(SOURCE_SHORT[code] || code);
  const parts = [r.authors, r.title_ru, r.publisher, r.year].filter(Boolean).map(x => String(x).replace(/\.\s*$/, '')); // без «et al..»
  return esc(parts.join('. '));
}
export const JUR_RU = { Codex: 'Кодекс Алиментариус', EU: 'ЕС', Japan: 'Япония', USA: 'США', IAEA: 'МАГАТЭ' };

// «1 год», «2 года», «5 лет», «11 лет», «21 год»
export const yearsWord = (n) => {
  const k = Math.abs(Math.trunc(n)) % 100, d = k % 10;
  return k >= 11 && k <= 14 ? 'лет' : d === 1 ? 'год' : d >= 2 && d <= 4 ? 'года' : 'лет';
};
// #FR-20: добавочный риск — «1 на N», цвет по уровням НРБ-99/2009 п. 2.3, логарифмическая шкала 10⁻⁸…10⁻³ с отметками уровней
export const RISK_TXT = { negligible: 'пренебрежимо малый риск (не больше 1 на 1 млн — пожизненный риск от облучения за год, НРБ-99/2009 п. 2.3)', within: 'выше пренебрежимого (1 на млн), но не выше 50 на 1 млн — пожизненного риска от облучения за год, исходя из которого установлены пределы доз населения', exceeds: 'выше 50 на 1 млн — пожизненного риска от облучения за год, исходя из которого установлены пределы доз населения' };
export const logPos = (x) => Math.max(0, Math.min(100, (Math.log10(x) + 8) / 5 * 100));
