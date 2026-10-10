// #FR-81 D22: относительная погрешность при K ≠ 1 делится на A продукта, а не A пробы
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const nuc = (a, u, k) => [{ nuclide: 'Sr-90', source: 'measured', measuredBqPerKg: a, measuredUncertaintyBqPerKg: u, transferId: 'perevolotsky2006_kp_sr_90_bilberry', variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: k } }];
const range = (a, u, k) => run(null, 'черника лесная', [], { nuclides: nuc(a, u, k) }).rows[0].depositionEstimate.range.kBqPerM2;

test('D22: проба 100 Бк/кг, K = 2, u = 5 Бк/кг продукта (10 %) → тот же разброс, что у продукта 50 ± 5 при K = 1', () => {
  const a = range(100, 5, 2), b = range(50, 5, 1);
  assert.ok(Math.abs(a.lo - b.lo) <= 1e-9 * b.lo && Math.abs(a.hi - b.hi) <= 1e-9 * b.hi, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
});
test('D22: при K = 1 разброс не изменился (u/A = 10 %)', () => {
  const r = range(50, 5, 1), c = run(null, 'черника лесная', [], { nuclides: nuc(50, 0, 1) }).rows[0].depositionEstimate.range.kBqPerM2;
  assert.ok(Math.abs(r.hi / c.hi - 1.1) < 1e-9);
});
