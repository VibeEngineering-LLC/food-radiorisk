// #FR-95: подстрока «в т. ч. рак лёгкого от радона в жилище» к строке «Новообразования»: значения из модуля radonRisk (Darby 2005), вне суммы причин
import { radonRisk, DEFAULT_COEFFS } from '../vendor/radon_risk/radonRisk.mjs';
import { startAge } from './compare.js';

// #FR-99 (Б-2): модуль даёт риск «к 75 годам»; на горизонт круга (до возраста b) пересчёт пропорционально возрасту — допущение, подписанное на экране.
// Параметр горизонта модуля берётся из его коэффициентов, не из кода. Курящий — только отношение к некурящему (текстом), в популяционный круг не входит.
export function radonLungSub(input, H, radonC, b) {
  if (!input || !Number.isFinite(H) || H <= 0 || typeof radonC !== 'number' || !Number.isFinite(radonC) || radonC < 1 || radonC > 10000) return null;
  const s = startAge(input), h = DEFAULT_COEFFS.assumptions.darby_horizon_years.value;
  const ra = (smoking) => radonRisk({ C: radonC, years: H, ageStart: s, smoking }).darby.excess;
  const never = ra('never'), smoker = ra('smoker');
  const k = Number.isFinite(b) ? Math.min(1, Math.max(0, (b - s) / (h - s))) : 1; // доля накопления риска до возраста b
  return { C: radonC, H, b, s, h, k, never, smoker, neverB: never * k, ratio: never > 0 ? smoker / never : null };
}

// #FR-99: доля подсектора «радон, некурящий» от итога круга; лимит — смерти от рака лёгкого за тот же горизонт (иначе новообразования).
// Превышение не обрезается: флаг bad — UI показывает предупреждение и не рисует подсектор, тест красит.
export function radonSubShares(sub, limitP, total) {
  if (!sub || !(total > 0) || !Number.isFinite(limitP)) return null;
  const bad = !(sub.neverB >= 0) || sub.neverB > limitP;
  return { never: sub.neverB / total, bad };
}
