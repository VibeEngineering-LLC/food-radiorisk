// #FR-108 (оператор 2026-10-11, «Пересчитать назад»): питание раньше даты пробы — активность пересчитывается назад, одно предупреждение;
// раньше выпадений — одна ошибка на расчёт; неверная дата — ошибка
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { T } from '../src/ui/texts_v.js';

const half = (n) => data.nuclides.find(r => r.nuclide === n && r.recommended).half_life_days;
const mk = (nucs, eatDate, extra = {}) => inputFor(null, 'продукт', nucs.map(n => [n, 1000]), {
  eatDate, constantActivity: true, years: 1,
  nuclides: nucs.map(n => ({ nuclide: n, source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 }, ...extra }))
});
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.abs(b), `${a} ≠ ${b}`);

test('FR-108(а): питание на 15 дней раньше пробы — поступление = A·2^(+15/T), одно предупреждение, строка «распад назад»', () => {
  const on = computeScenario(data, mk(['I-131', 'Cs-137'], '2016-06-01', { sampleDate: '2016-06-01' }));
  const back = computeScenario(data, mk(['I-131', 'Cs-137'], '2016-05-17', { sampleDate: '2016-06-01' }));
  assert.equal(back.ok, true, back.errors?.join('; '));
  for (const [i, n] of ['I-131', 'Cs-137'].entries()) {
    near(back.rows[i].intakeBqPerYear, on.rows[i].intakeBqPerYear * Math.pow(2, 15 / half(n)));
    assert.ok(back.rows[i].intakeBqPerYear > on.rows[i].intakeBqPerYear);
    assert.ok(back.rows[i].provenance.some(p => p.step === 'распад назад'));
  }
  assert.equal(back.warnings.filter(w => w === T.EAT_BEFORE_SAMPLE_WARN).length, 1);
  assert.match(T.EAT_BEFORE_SAMPLE_WARN, /пересчитана назад/);
  assert.equal(on.warnings.filter(w => /раньше даты пробы/.test(w)).length, 0);
});

test('FR-108(б): питание раньше выпадений — одна ошибка на весь расчёт (не по нуклиду)', () => {
  const inp = mk(['I-131', 'Cs-137'], '2016-05-17');
  inp.nuclides = inp.nuclides.map(n => ({ ...n, source: 'deposition', depositionKBqPerM2: 10, depositionDate: '2016-06-01', transferId: data.transfer.find(t => t.unit_norm === 'm2/kg' && Number.isFinite(t.unit_factor))?.id }));
  const r = computeScenario(data, inp);
  assert.equal(r.ok, false);
  assert.equal(r.errors.filter(e => /предшествует дате выпадений/.test(e)).length, 1);
});

test('FR-108(в): неверная дата — ошибка', () => {
  const r = computeScenario(data, mk(['Cs-137'], 'не-дата', { sampleDate: '2016-06-01' }));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /неверно/);
});
