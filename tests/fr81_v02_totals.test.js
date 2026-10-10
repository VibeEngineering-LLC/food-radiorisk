// #FR-81 V02: итоговые величины — главное число R, доза самого нагруженного года, класс словесной оценки (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';
import { doseClassOf } from '../src/calc/model.js';

const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} != ${b}`);
const E = data.dose_coeff.find(r => r.nuclide === 'Cs-137' && r.age === 'adult' && r.source === 'ICRP119_F1').value; // Зв/Бк
const cs = (dose, extra = []) => run(null, 'молоко', [['Cs-137', dose / E], ...extra], { portionKg: 1, portionsPerYear: 1, constantActivity: true }).totals; // годовая доза от Cs-137 равна dose (Зв)

test('V02: S1 сушёные грибы 10 лет — R = 0,05 · ΣE = 16,25·10⁻⁶', () => {
  const t = run('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, product: { name: 'грибы сушёные', state: 'dried' } }).totals;
  near(t.riskNominal, 16.25e-6, 1e-3);
  near(t.doseMaxYearTech, 32.5e-6, 1e-3);
  assert.equal(t.doseMaxYearIndex, 1);
});

test('V02: S3 — доза 15,42 мкЗв за год при Ē₅ = 3,08 мкЗв даёт класс c2', () => {
  const t = cs(15.42e-6);
  assert.equal(t.doseClass, 'c2');
  near(t.doseSvAvg5, 15.42e-6 / 5, 1e-6);
});

test('V02: границы класса — ровно 10 мкЗв это c1, ровно 1 мЗв это c2', () => {
  const lim = { optimNegligibleSv: 1e-5, yearSv: 1e-3 };
  assert.equal(doseClassOf(1e-5, lim), 'c1');
  assert.equal(doseClassOf(1.0000001e-5, lim), 'c2');
  assert.equal(doseClassOf(1e-3, lim), 'c2');
  assert.equal(doseClassOf(1.0000001e-3, lim), 'c3');
});

test('V02: только природные нуклиды — класса и R нет', () => {
  const t = run(null, 'вода', [['Ra-226', 1]]).totals;
  assert.equal(t.doseClass, null);
  assert.equal(t.riskNominal, null);
  assert.equal(t.doseMaxYearTech, null);
});

test('V02: Cs-137 малой дозы + Ra-226 большой дозы — класс и R только по техногенному', () => {
  const t = cs(5e-6, [['Ra-226', 1e5]]);
  assert.equal(t.doseClass, 'c1');
  near(t.riskNominal, 0.05 * 5e-6, 1e-6);
  assert.ok(t.doseSvTotal > 10 * t.doseMaxYearTech);
});
