// src/calc/summary_charts.js
// Чистые функции для построения данных диаграмм «сводки» (без DOM/React).

import { radonRisk } from '../vendor/radon_risk/radonRisk.mjs';
import { startAge } from './compare.js';
import { fmtNum } from '../ui/fmt.js';

// #FR-101 (D-031): умолчания полей «Сравнения» (радон, гамма-фон жилища, КТ, рентгенография) зависят от региона и берутся из данных: region_parts.js → regionDefaults, ext_inputs.js → effectiveInputs. Чисел в коде нет.

// Доза «фона в жилище» (без радона) по введённому показанию дозиметра, мкЗв/ч, за горизонт H (Зв) — тем же расчётом, что withDwelling во вкладке «Сравнение»; null, если не введено/вне 0–100.
export function homeDwellingDoseSv(comparison, dwellU) {
  if (!comparison || !comparison.dwell || !Number.isFinite(dwellU) || dwellU <= 0 || dwellU > 100) return null;
  return dwellU * 1e-6 * comparison.dwell.hours * comparison.dwell.h10ToE * comparison.horizonYears;
}

// Доза от радона в жилище за горизонт H (Зв), либо null при невалидных входах.
export function homeRadonDoseSv(input, comparison, radonC) {
  if (!comparison) return null;
  const H = comparison.horizonYears;
  if (typeof radonC !== 'number' || !Number.isFinite(radonC) || radonC < 1 || radonC > 10000) return null;
  const F = comparison.parts?.radonF; // #FR-101 v41: коэффициент равновесия региона (мир 0,4, Россия 0,5); модуль принимает F во входе, его коэффициенты не меняются
  const res = radonRisk({ C: radonC, years: H, ageStart: startAge(input), smoking: 'never', ...(Number.isFinite(F) ? { F } : {}) });
  const mSv = res && res.totalDose_mSv;
  if (typeof mSv !== 'number' || !Number.isFinite(mSv)) return null;
  return mSv * 1e-3;
}

// Срезы диаграммы «доза за жизнь по источникам» (#FR-89 v29): все составляющие из данных, строки по возрастанию дозы — см. dose_sources.js
export { buildDoseSlices as doseSlices, DEFAULT_FLIGHT_PER_YEAR } from './dose_sources.js';

// Цвет сектора диаграммы (б) закреплён за причиной (код ВОЗ), а не за позицией в отсортированном списке
const CAUSE_COLOR = { product: 0, cs_1026: 1, cs_1064: 2, cs_1096: 3, cs_1097: 4, cs_1098: 5, cs_1099: 6, cs_1100: 7, cs_1101: 8, cs_1102: 9, cs_other: 11 }; // «прочие» — нейтральный серый

// #FR-100 v39: названия причин для населения (полное название в легенде; коды МКБ/ВОЗ — только в подсказке); единый стиль: с прописной, без точки
export const RISK_LABEL = {
  cs_1026: ['Злокачественные и другие новообразования (рак)', 'коды МКБ-10 C00–D48'],
  cs_1064: ['Болезни системы кровообращения (инфаркт, инсульт)', 'коды МКБ-10 I00–I99'],
  cs_1096: ['Дорожно-транспортные происшествия', 'код ВОЗ 1096'],
  cs_1097: ['Падения', 'код ВОЗ 1097'],
  cs_1098: ['Утопления', 'код ВОЗ 1098'],
  cs_1099: ['Пожары', 'код ВОЗ 1099'],
  cs_1100: ['Случайные отравления', 'код ВОЗ 1100'],
  cs_1101: ['Самоубийства', 'код ВОЗ 1101'],
  cs_1102: ['Убийства', 'код ВОЗ 1102'],
  cs_other: ['Прочие причины смерти', 'все остальные причины: код ВОЗ 1000 минус показанные'],
  ref_1000: ['Все причины смерти', 'код ВОЗ 1000'],
  ref_1034: ['рак трахеи, бронхов и лёгкого', 'код ВОЗ 1034; входит в «Злокачественные и другие новообразования»'],
  ref_1095: ['Внешние причины смерти (всего)', 'код ВОЗ 1095; включает дорожные происшествия, падения, утопления, пожары, отравления, самоубийства, убийства и прочие'],
};
export const riskLabel = (id, fallback) => RISK_LABEL[id]?.[0] ?? fallback;

// Срезы диаграммы «риск смерти за жизнь по причинам»; по ВОЗРАСТАНИЮ риска (решение оператора), питание встаёт на своё место по величине.
export function riskSlices(life) {
  if (!life || !life.lifetime || !life.lifetime.rows) return null;
  const lt = life.lifetime;
  const rows = lt.rows.filter(row => Number.isFinite(row.p) && row.p > 0).sort((x, y) => x.p - y.p);
  const total = rows.reduce((sum, row) => sum + row.p, 0);
  const slices = rows.map(row => ({
    id: row.id,
    label: row.kind === 'product' ? 'Этот продукт — радиационно-индуцированный рак' : riskLabel(row.id, row.label),
    hint: RISK_LABEL[row.id]?.[1],
    p: row.p,
    share: total > 0 ? row.p / total : 0,
    ci: CAUSE_COLOR[row.id] ?? 11,
  }));
  return { a: lt.a, b: lt.b, H: lt.H, capped: lt.capped, total, slices };
}

// Доля в процентах для подписи.
export function fmtShare(frac) {
  if (typeof frac !== 'number' || !Number.isFinite(frac)) return '—';
  const x = frac * 100;
  if (x === 0) return '0 %';
  return `${fmtNum(x, 2)} %`;
}

// #FR-89: масштаб ЛИНЕЙНЫЙ (решение оператора): угол сектора строго пропорционален доле, без логарифма и без раздувания малых долей;
// малая доля читается по подписи (выноска, легенда с числом и %). Углы в градусах, сумма 360; неположительная доля — 0.
export function linearAngles(shares) {
  const ok = shares.map(s => (typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 0));
  const sum = ok.reduce((a, b) => a + b, 0);
  return ok.map(s => (sum > 0 ? (s / sum) * 360 : 0));
}
