// #FR-81 D10: главное число — один год питания; с уровнями НРБ и пределом 1 мЗв сравнивается Ē₅ — наибольшая средняя за 5 лет подряд (окно с нулями за пределами срока, метод шаг 8.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';
import { avg5, sumSeries } from '../src/calc/years.js';

const near = (a, b, rel = 1e-12) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} ≠ ${b}`);
const go = (age, years, over = {}, nuc = [['Sr-90', 20]]) => run(null, 'молоко', nuc, { age, years, constantActivity: true, portionKg: 0.3, portionsPerYear: 365, riskCoeffPerSv: 0.05, ...over }).totals;

test('D10: avg5 — окно из 5 лет, за пределами срока нули; срок ≤ 5 лет даёт сумму / 5', () => {
  assert.equal(avg5([1, 2, 3, 4, 5, 6, 7]), 5);
  assert.equal(avg5([1, 1]), 0.4);
  assert.deepEqual(sumSeries([[1, 2], [3, 4]]), [4, 6]);
});

test('D10: пример 2 метода (с 3 до 13 лет): Ē₅ = (4·0,1314 + 0,1752) / 5 = 0,1402 мЗв, наибольший год 0,1752, первый год 0,1029', () => {
  const t = go('5y', 10, { lifetime: { fromAge: 3, toAge: 13 } });
  near(t.doseSvAvg5, (4 * 2190 * 6e-8 + 2190 * 8e-8) / 5);
  near(t.doseSvMaxYear, 2190 * 8e-8);
  near(t.doseSvPerYear, 2190 * 4.7e-8);
  near(t.budgetShare1mSvAvg5, t.doseSvAvg5 / 1e-3);
  near(t.riskMaxYear, 2190 * 8e-8 * 0.05); // риск самого нагруженного года (V02)
});

test('D10: пример 3 метода (младенец, 3 года): Ē₅ = E_N / 5 = 0,2044 мЗв, риск 1,022·10⁻⁵', () => {
  const t = go('3m', 3, { portionKg: 0.4 });
  near(t.doseSvAvg5, 2920 * (2.3e-7 + 7.3e-8 + 4.7e-8) / 5);
});

test('D10/V02: словесный класс определяется по дозе самого нагруженного года, а не по Ē₅ (1,5 мЗв за один год: Ē₅ = 0,3 мЗв, класс c3)', () => {
  const t = go('adult', 1, { portionKg: 0.1, portionsPerYear: 10 }, [['Cs-137', 1.5e-3 / 1.3e-8]]);
  assert.ok(t.riskPerYear > 5e-5);
  assert.ok(t.doseMaxYearTech > 1e-3);
  assert.ok(t.doseSvAvg5 < 1e-3);
});
