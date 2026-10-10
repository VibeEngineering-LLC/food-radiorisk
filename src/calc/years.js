// #FR-81 D08: план питания по годам — физический распад активности продукта (среднее за год) и вес года
import { AGE_BANDS } from './lifetime.js';

export const DAYS_PER_YEAR = 365.25;

// #FR-81 D09: возраст в начале питания, если задана только возрастная группа (подпись группы: «3 мес», «1 год», «5 лет» …); взрослый — 20 лет (МКРЗ 72, п. 23)
export const NOMINAL_AGE = { '3m': 0, '1y': 1, '5y': 5, '10y': 10, '15y': 15, adult: 20 };

export function meanDecay(halfLifeYears, t0, t1) {
    if (typeof halfLifeYears !== 'number' || !Number.isFinite(halfLifeYears) || halfLifeYears <= 0) {
        return 1;
    }
    const lambda = Math.LN2 / halfLifeYears;
    const d = t1 - t0;
    return Math.exp(-lambda * t0) * (-Math.expm1(-lambda * d)) / (lambda * d);
}

export function bandAt(age) {
    if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) {
        throw new RangeError('bandAt: возраст должен быть конечным числом ≥ 0');
    }
    const band = AGE_BANDS.find(b => age >= b.from && age < b.to);
    if (!band) {
        throw new RangeError('bandAt: возраст вне диапазона групп');
    }
    return band.age;
}

export function yearPlan({ years, halfLifeYears = null, startAge = null }) {
    if (typeof years !== 'number' || !Number.isFinite(years) || years <= 0) {
        throw new RangeError('yearPlan: years должно быть конечным числом > 0');
    }
    const n = Math.ceil(years - 1e-9);
    const plan = [];
    for (let k = 1; k <= n; k++) {
        const t0 = k - 1;
        const t1 = Math.min(k, years);
        const weight = t1 - t0;
        const decay = meanDecay(halfLifeYears, t0, t1);
        const ageFrom = startAge === null ? null : startAge + t0;
        const band = ageFrom === null ? null : bandAt(ageFrom);
        plan.push({ k, t0, t1, weight, decay, ageFrom, band });
    }
    return plan;
}

// #FR-81 D10: наибольшая средняя за 5 лет подряд (НРБ-99/2009 табл. 3.1); за пределами срока доза от продукта равна нулю, поэтому при сроке ≤ 5 лет Ē₅ = E_N / 5 (метод, шаг 8.2)
export function avg5(doses) {
  if (doses.length <= 5) return doses.reduce((s, d) => s + d, 0) / 5;
  let best = 0;
  for (let i = 0; i + 5 <= doses.length; i++) best = Math.max(best, doses.slice(i, i + 5).reduce((s, d) => s + d, 0));
  return best / 5;
}

// сумма рядов по годам (ряды нуклидов одной длины)
export const sumSeries = (list) => Array.from({ length: Math.max(0, ...list.map(s => s.length)) }, (_, i) => list.reduce((s, x) => s + (x[i] || 0), 0));
