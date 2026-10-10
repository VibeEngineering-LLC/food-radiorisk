// #FR-81 D18: «Дата начала питания» (по умолчанию — сегодня): распад от даты пробы до начала питания, затем по годам питания (D08)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';
import { screen, ch } from './render_scenario.js';
import { initialRaw, todayISO } from '../src/react/formState.js';

const T = data.nuclides.find(r => r.nuclide === 'Cs-137' && r.recommended).half_life_days / 365.25;
const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} ≠ ${b}`);
const go = (eatDate, over = {}) => run(null, 'продукт', [['Cs-137', 1000]], { eatDate, ...over });
const withSample = (r) => ({ ...r, nuclides: r.nuclides.map(n => ({ ...n, sampleDate: '2016-06-01' })) });

test('D18: проба 01.06.2016, питание с 01.06.2026 — активность уменьшена на 3652 дня распада', () => {
  const r = go('2026-06-01', { constantActivity: true, years: 1 });
  near(r.rows[0].intakeBqPerYear, 1000);
  const base = run(null, 'продукт', [['Cs-137', 1000]], { eatDate: '2026-06-01', constantActivity: true, years: 1, nuclides: [{ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: '2016-06-01', variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } }] });
  near(base.rows[0].intakeBqPerYear, 1000 * Math.pow(2, -3652 / (T * 365.25)));
});

test('D18: после даты начала распад идёт по годам питания (поступление за 10 лет = A·f_дата·(T/ln2)(1−2^(−10/T)))', () => {
  const r = run(null, 'продукт', [['Cs-137', 1000]], { eatDate: '2026-06-01', years: 10, nuclides: [{ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: '2016-06-01', variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } }] });
  near(r.rows[0].intakeBqTotal, 1000 * Math.pow(2, -3652 / (T * 365.25)) * (T / Math.LN2) * (1 - Math.pow(2, -10 / T)));
});

test('D18: дата начала раньше даты пробы — понятная ошибка', () => {
  const r = run(null, 'продукт', [['Cs-137', 1000]], { eatDate: '2010-01-01', nuclides: [{ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: '2016-06-01', variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } }] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /раньше даты пробы/);
});

test('D18: по умолчанию дата начала питания — сегодня; поле есть в форме и попадает в ввод расчёта', async () => {
  assert.equal(initialRaw(ch).eatDate, todayISO());
  assert.match(todayISO(new Date(2026, 9, 5)), /^2026-10-05$/);
  const s = await screen({ field: { eatDate: '2026-10-05' }, comp: ['src/react/Form.jsx', 'default', () => ({ choices: ch, raw: initialRaw(ch, '2026-10-05'), setRaw() {}, tab: 1, setTab() {}, onPreset() {}, onExport() {} })] });
  assert.match(s.html, /Дата начала питания/);
  assert.equal((await screen({ field: { eatDate: '2026-10-05' } })).input.eatDate, '2026-10-05');
});
