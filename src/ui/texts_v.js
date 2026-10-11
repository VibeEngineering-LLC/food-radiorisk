// #FR-81 V04 (D-022): тексты экрана результата — единая точка правки формулировок; сами строки лежат в texts_v.json
// (данные, не код), здесь — подстановка и согласование слов по числу.
import TEXTS from './texts_v.json' with { type: 'json' };
import { nb } from './fmt.js';

// #FR-124: число и единица («10 мкЗв», «100 %»), разряды («1 000 000») и «п. 2.3» не разрываются при переносе строки — неразрывный пробел во всех строках экрана и отчётов
const nbDeep = (v) => typeof v === 'string' ? nb(v) : Array.isArray(v) ? v.map(nbDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nbDeep(x)])) : v;
export const T = nbDeep(TEXTS);

/** подстановка {имя} в шаблон; нет значения — пустая строка */
export const fill = (tpl, vars = {}) => nb(tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''));

/** слово по числу, заданному строкой экрана: целое — 1 / 2–4 / остальные, дробное — родительный падеж единственного числа (форма «2–4») */
export function plural(numStr, [one, few, many, frac = few]) { // v54: четвёртая форма — дробное число (родительный ед.), если она отличается от формы «2–4» («2,5 рентгеновского снимка», но «4 рентгеновских снимка»)
  if (/[,.]/.test(numStr)) return frac;
  const n = Math.abs(parseInt(numStr.replace(/\s/g, ''), 10)), k = n % 100, d = n % 10;
  return k >= 11 && k <= 14 ? many : d === 1 ? one : d >= 2 && d <= 4 ? few : many;
}
/** «года/лет» после возраста в родительном падеже: «с 3 лет», «в возрасте 21 года», «с 7,5 лет» */
export const ageWord = (a) => Number.isInteger(a) && a % 10 === 1 && a % 100 !== 11 ? 'года' : 'лет';
export const WORDS = { day: ['день', 'дня', 'дней'], xray: ['рентгеновский снимок', 'рентгеновских снимка', 'рентгеновских снимков', 'рентгеновского снимка'], hour: ['час', 'часа', 'часов'], year: ['год', 'года', 'лет'], times: ['раз', 'раза', 'раз'], flight: ['перелёт', 'перелёта', 'перелётов'], death: ['смерть', 'смерти', 'смертей'] };
/** #FR-123: число смертей от рака для сравнения с фоном — целым с «около» (меньше одной — так и сказано), точное значение в скобках «N на 1 000 000»; общий помощник склонения */
/** после «около» — родительный падеж: «около 3 смертей», «около 21 смерти», «около 94 смертей» */
export const deathsGen = (numStr) => { const n = Math.abs(parseInt(String(numStr).replace(/\s/g, ''), 10)); return n % 10 === 1 && n % 100 !== 11 ? 'смерти' : 'смертей'; };
export function deathsPhrase(p, fmtCount, fmtPerMillion) {
  const k = p * 1e6, exact = fmtPerMillion(p);
  if (Number(k.toPrecision(2)) < 1) return `меньше одной смерти от рака (${exact} на 1 000 000)`;
  const n = fmtCount(k);
  return `около ${n} ${deathsGen(n)} от рака (${exact} на 1 000 000)`;
}
/** «года/лет» в родительном падеже для срока: «в течение 1 года», «2 лет», «21 года», «50 лет» */
export const yearsGen = (n) => (Number.isInteger(n) && n % 10 === 1 && n % 100 !== 11 ? 'года' : 'лет');
/** переменные шаблона «в {N} {times} выше»: «в 21 раз», «в 23 раза», «в 25 раз» (число — уже округлённая строка экрана) */
export const timesVars = (nStr) => ({ N: nStr, times: plural(nStr, WORDS.times) });

const NUC_RU = { Cs: 'цезий', Sr: 'стронций', I: 'йод', Ra: 'радий', Po: 'полоний', Pu: 'плутоний', Am: 'америций', Co: 'кобальт', Ru: 'рутений', U: 'уран', Th: 'торий', K: 'калий', Pb: 'свинец', Y: 'иттрий', Rn: 'радон' };
/** «Cs-137» → «цезий-137»; неизвестный элемент остаётся как есть */
export const nuclideRu = (n) => { const [el, a] = String(n).split('-'); return NUC_RU[el] ? `${NUC_RU[el]}-${a}` : n; };
