// src/calc/summary_charts.js
// Чистые функции для построения данных диаграмм «сводки» (без DOM/React).

import { radonRisk } from '../vendor/radon_risk/radonRisk.mjs';
import { startAge } from './compare.js';
import { fmtNum } from '../ui/fmt.js';

// #FR-89 v27: радон и торон мирового фона берутся из данных (comparison.worldRadon; записи bg_radon_world, bg_thoron_world — UNSCEAR 2008, Annex B, Table 12), в коде числа нет.
// ОА радона по умолчанию — то же значение, что начальное состояние поля на вкладке «Сравнение с облучением».
// #FR-91 v33: умолчания — решение оператора (до ввода пользователем): ОА радона-222 200 Бк/м³, мощность дозы в жилище 0,15 мкЗв/ч. Источник «принято по умолчанию»: цитаты норматива в библиотеке под это число не искали и не подставляли.
export const DEFAULT_RADON_C = 200;
export const DEFAULT_DWELL_U = 0.15;

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
  const res = radonRisk({ C: radonC, years: H, ageStart: startAge(input), smoking: 'never' });
  const mSv = res && res.totalDose_mSv;
  if (typeof mSv !== 'number' || !Number.isFinite(mSv)) return null;
  return mSv * 1e-3;
}

// Срезы диаграммы «доза за жизнь по источникам» (#FR-89 v29): все составляющие из данных, строки по возрастанию дозы — см. dose_sources.js
export { buildDoseSlices as doseSlices, DEFAULT_XRAY_PER_YEAR, DEFAULT_FLIGHT_PER_YEAR } from './dose_sources.js';

// Цвет сектора диаграммы (б) закреплён за причиной (код ВОЗ), а не за позицией в отсортированном списке
const CAUSE_COLOR = { product: 0, cs_1026: 1, cs_1064: 2, cs_1096: 3, cs_1097: 4, cs_1098: 5, cs_1099: 6, cs_1100: 7, cs_1101: 8, cs_1102: 9, cs_other: 11 }; // «прочие» — нейтральный серый

// Срезы диаграммы «риск смерти за жизнь по причинам»; по ВОЗРАСТАНИЮ риска (решение оператора), питание встаёт на своё место по величине.
export function riskSlices(life) {
  if (!life || !life.lifetime || !life.lifetime.rows) return null;
  const lt = life.lifetime;
  const rows = lt.rows.filter(row => Number.isFinite(row.p) && row.p > 0).sort((x, y) => x.p - y.p);
  const total = rows.reduce((sum, row) => sum + row.p, 0);
  const slices = rows.map(row => ({
    id: row.id,
    label: row.kind === 'product' ? 'Питание этим продуктом' : row.label,
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
  if (x === 0) return '0 %';
  return `${fmtNum(x, 2)} %`;
}

// #FR-89: масштаб ЛИНЕЙНЫЙ (решение оператора): угол сектора строго пропорционален доле, без логарифма и без раздувания малых долей;
// малая доля читается по подписи (выноска, легенда с числом и %). Углы в градусах, сумма 360; неположительная доля — 0.
export function linearAngles(shares) {
  const ok = shares.map(s => (typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 0));
  const sum = ok.reduce((a, b) => a + b, 0);
  return ok.map(s => (sum > 0 ? (s / sum) * 360 : 0));
}
