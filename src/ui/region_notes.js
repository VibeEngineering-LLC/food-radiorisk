import { fmtNum, nb } from './fmt.js';
import { REGION_NAME, CAPTION, normRegion } from '../calc/region.js';

// #FR-101 (D-031): тексты подсказок, зависящие от региона данных. parts — comparison.parts (region_parts.js); все числа берутся из parts (данные), в коде чисел нет.

export const regionName = (region) => REGION_NAME[normRegion(region)];

// #FR-101 v41: подпись коэффициента равновесия радона региона — «F = 0,4 (МКРЗ 126)» / «F = 0,5 (МР 2.6.1.0333-23)»; значение и источник — из данных (parts.radonF, parts.radonFSrc)
const F_SRC = { ICRP126: 'МКРЗ 126', MR_2_6_1_0333_23: 'МР 2.6.1.0333-23' };
export function radonFNote(parts) {
  if (!parts || parts.radonF == null) return '';
  return `F = ${fmtNum(parts.radonF)} (${F_SRC[parts.radonFSrc?.source] ?? parts.radonFSrc?.source})`;
}

// Подпись источников диаграммы облучения (регион и год данных)
export const doseCaption = (region) => CAPTION[normRegion(region)].dose;
export const riskCaption = (region) => CAPTION[normRegion(region)].risk;

// Короткое название таблицы дожития и долей причин для подписи диаграммы (б)
export function lifeTableName(region) {
  return normRegion(region) === 'ru' ? 'таблица дожития Росстата, доли причин ВОЗ' : 'таблица дожития ООН (WPP 2024), доли причин ВОЗ (GHE 2023)';
}

// Строка про КТ и рентгенографию для примечания к медицине.
// ct = parts.ct ({freq, share|null, doseProc, derived}), rad = parts.rad ({freq, doseProc, derived}).
// Формат: `КТ: ${fmtNum(ct.freq*1000)} на 1000 жителей в год${ct.share != null ? `, из них грудной клетки ${fmtNum(ct.share*100)} %` : ', доли грудной клетки для региона нет — взяты все КТ'}, доза процедуры ${fmtNum(ct.doseProc)} мЗв${ct.derived ? ' (средняя на одну КТ)' : ''}; рентгенография и флюорография: ${fmtNum(rad.freq*1000)} на 1000 жителей в год, доза процедуры ${fmtNum(rad.doseProc)} мЗв${rad.derived ? ' (средняя на один снимок)' : ''}.`
// Если ct или rad нет — вернуть пустую строку.
export function ctNote(parts) {
  if (!parts || !parts.ct || !parts.rad) return '';
  const ct = parts.ct;
  const rad = parts.rad;
  return nb(`КТ: ${fmtNum(ct.freq * 1000)} на 1 000 жителей в год${ct.share != null ? `, из них грудной клетки ${fmtNum(ct.share * 100)} %` : ', доли грудной клетки для региона нет — взяты все КТ'}, доза процедуры ${fmtNum(ct.doseProc)} мЗв${ct.derived ? ' (средняя на одну КТ)' : ''}; рентгенография и флюорография: ${fmtNum(rad.freq * 1000)} на 1 000 жителей в год, доза процедуры ${fmtNum(rad.doseProc)} мЗв${rad.derived ? ' (средняя на один снимок)' : ''}.`);
}

// Пояснение к умолчанию радона для подсказки полей: возвращает строку, начинающуюся с пробела и заключённую в скобки, либо пустую строку.
// Если parts.radonEec есть (режим «Россия»): ` (средняя ЭРОА по России ${fmtNum(parts.radonEec.eec)} Бк/м³, делённая на коэффициент равновесия ${fmtNum(parts.radonEec.f)}, принятый нормативно в РФ — МР 2.6.1.0333-23)`.
// Иначе если parts.radonDefaultC != null: ` (среднее по миру, НКДАР ООН 2000)`. Иначе ''.
export function radonDefaultNote(parts) {
  if (!parts) return '';
  if (parts.radonEec) {
    return nb(` (средняя эквивалентная равновесная объёмная активность (ЭРОА) по России ${fmtNum(parts.radonEec.eec)} Бк/м³, делённая на коэффициент равновесия ${fmtNum(parts.radonEec.f)}, установленный нормативными документами РФ — методические рекомендации МР 2.6.1.0333-23)`);
  }
  if (parts.radonDefaultC != null) {
    return ` (среднее по миру, НКДАР ООН 2000; ${radonFNote(parts)})`;
  }
  return '';
}

// Текст умолчания поля «мощность дозы в жилище» для подсказки.
// Если parts.dwellDefaultU != null: `${fmtNum(parts.dwellDefaultU)} мкЗв/ч (среднее по региону; в расчёте, пока вы не введёте своё значение, берётся среднее внешнее облучение от земли и стройматериалов)`. Иначе: 'не задано (среднее для мира не подтверждено; в расчёте берётся среднее внешнее облучение от земли и стройматериалов)'.
export function dwellDefaultText(parts) {
  if (!parts) return 'не задано (среднее для мира не подтверждено; в расчёте берётся среднее внешнее облучение от земли и стройматериалов)';
  if (parts.dwellDefaultU != null) {
    return nb(`${fmtNum(parts.dwellDefaultU)} мкЗв/ч (среднее по региону; в расчёте, пока значение не введено, берётся среднее внешнее облучение от земли и стройматериалов)`);
  }
  return 'не задано (среднее для мира не подтверждено; в расчёте берётся среднее внешнее облучение от земли и стройматериалов)';
}
