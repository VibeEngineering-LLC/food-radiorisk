// #FR-81 (метод, шаг 4а): Y-90 при Sr-90 — отдельная добавка со своим e(g); по умолчанию в дозу не входит, включается отметкой
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';
import { screen } from './render_scenario.js';
const SRC = ['src/react/Result.jsx', 'default', (result, input) => ({ result, input, meta: null, initialTab: 'src' })]; // #FR-81 V13: таблица по нуклидам — на вкладке «Расчёт и источники»

const go = (over = {}) => run(null, 'молоко', [['Sr-90', 20]], { age: '5y', lifetime: { fromAge: 3, toAge: 13 }, years: 1, constantActivity: true, portionKg: 0.3, portionsPerYear: 365, ...over }).rows[0];
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.abs(b), `${a} ≠ ${b}`);

test('Y-90: добавка в примере 2 метода — E_N(Y) = 2190·(4·1,0·10⁻⁸ + 5·5,9·10⁻⁹ + 3,3·10⁻⁹), отношение e_Y/e_Sr первого года 0,213', () => {
  const r = go();
  near(r.y90.doseSvTotal, 2190 * (4 * 1.0e-8 + 5 * 5.9e-9 + 3.3e-9));
  near(r.y90.ratio, 1.0e-8 / 4.7e-8);
  near(r.doseSvTotal, 2190 * (4 * 4.7e-8 + 5 * 6e-8 + 8e-8));
});

test('Y-90: с отметкой доза = Sr + Y (+13,2 % в примере 2: 1,4034 мЗв вместо 1,2439)', () => {
  const r = go({ includeY90: true });
  near(r.doseSvTotal, 2190 * (4 * 5.7e-8 + 5 * 6.59e-8 + 8.33e-8));
  assert.ok(Math.abs(r.doseSvTotal / 1.2439e-3 - 1.1282) < 1e-3);
});

test('Y-90: для Cs-137 и при источнике НРБ добавки нет; на экране строка про иттрий', async () => {
  assert.equal(run(null, 'молоко', [['Cs-137', 10]]).rows[0].y90, null);
  assert.equal(go({ doseSource: 'NRB2009_App2', lifetime: null, age: '12-17y' }).y90, null);
  assert.match((await screen({ nuc: { nuclide: 'Sr-90', measured: '20' }, comp: SRC })).html, /Иттрий-90 в продукте при Sr-90: не включён/);
});
