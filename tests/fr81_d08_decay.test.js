// #FR-81 D08: физический распад активности продукта по годам (среднее за год, T½ из nuclides.json — тот же источник, что у поправки от даты пробы)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';
import { meanDecay } from '../src/calc/years.js';

const T = data.nuclides.find(r => r.nuclide === 'Cs-137' && r.recommended).half_life_days / 365.25;
const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} ≠ ${b}`);
const go = (over) => run(null, 'продукт', [['Cs-137', 1000]], over);

test('D08: среднее за год множителя 2^(−t/T) совпадает с численным интегралом', () => {
  const n = 200000;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += Math.pow(2, -(2 + (i + 0.5) / n) / 30) / n;
  }
  near(meanDecay(30, 2, 3), s, 1e-9);
  assert.equal(meanDecay(null, 0, 1), 1);
});

test('D08: поступление за 10 лет = A·m·Fr·(T/ln2)(1−2^(−10/T)), доза = e · поступление', () => {
  const r = go({ years: 10 }).rows[0];
  const total = 1000 * (T / Math.LN2) * (1 - Math.pow(2, -10 / T));
  near(r.intakeBqTotal, total);
  near(r.doseSvTotal, total * 1.3e-8);
  assert.equal(r.yearly.length, 10);
  near(r.intakeBqPerYear, r.yearly[0].intakeBq);
});

test('D08: «активность постоянна» — прежнее поведение; пометка про очищение — только при распаде', () => {
  const c = go({ years: 10, constantActivity: true });
  near(c.rows[0].intakeBqTotal, 10000);
  assert.equal(c.warnings.some(w => /очищение/.test(w)), false);
  const d = go({ years: 10 });
  assert.ok(d.warnings.some(w => /учтён только радиоактивный распад; очищение почвы и продуктов не учтено — оценка консервативна/.test(w)));
  assert.ok(d.rows[0].provenance.some(p => p.step === 'распад по годам' && p.id === 'hl_cs137_ddep'));
});
