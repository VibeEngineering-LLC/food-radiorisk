import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { depositionBounds } from '../src/calc/sample.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.abs(b), `${a} vs ${b}`);
const nuc = (u) => ({ nuclide: 'Sr-90', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: u, transferId: 'perevolotsky2006_kp_sr_90_bilberry', variant: 'central', sampleDate: null });
const scen = (u) => computeScenario(data, { age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 1, years: 1, eatDate: null, dryMatterPercent: null, product: { name: 'черника', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides: [nuc(u)] }).rows[0].depositionEstimate.range;

test('границы: разброс КП и погрешность A; кБк/м² и Ки/км²', () => {
  const b = depositionBounds({ central: 10, min: 5, max: 20, unbounded: false }, 0.1);
  near(b.kBqPerM2.lo, 4.5);
  near(b.kBqPerM2.hi, 22);
  near(b.ciPerKm2.lo, 4.5 / 37);
  near(b.ciPerKm2.hi, 22 / 37);
});

test('границы: одна точка КП — только от A', () => {
  const b = depositionBounds({ central: 10, min: null, max: null, unbounded: false }, 0.2);
  near(b.kBqPerM2.lo, 8);
  near(b.kBqPerM2.hi, 12);
});

test('границы: нулевой минимум КП — верх не ограничен', () => {
  const b = depositionBounds({ central: 10, min: 5, max: 20, unbounded: true }, 0.1);
  assert.strictEqual(b.kBqPerM2.hi, null);
  assert.strictEqual(b.ciPerKm2.hi, null);
  near(b.kBqPerM2.lo, 4.5);
});

test('границы: погрешность ≥ 100 % — низ 0', () => {
  const b = depositionBounds({ central: 10, min: 5, max: 20, unbounded: false }, 1.5);
  assert.strictEqual(b.kBqPerM2.lo, 0);
});

test('сценарий: погрешность A 10 % расширяет диапазон на ±10 %', () => {
  const a = scen(0);
  const b = scen(100);
  near(b.kBqPerM2.lo, a.kBqPerM2.lo * 0.9);
  near(b.kBqPerM2.hi, a.kBqPerM2.hi * 1.1);
  assert.ok(a.kBqPerM2.lo > 0);
  assert.ok(a.kBqPerM2.hi > a.kBqPerM2.lo);
  near(b.ciPerKm2.hi, b.kBqPerM2.hi / 37);
});
