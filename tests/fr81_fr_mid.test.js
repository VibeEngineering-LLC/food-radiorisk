// #FR-81 (оператор 05.10, D-021): Fr без рекомендованного значения — по умолчанию середина диапазона; максимум — отдельный вариант «скрининг»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';

const rng = data.processing.find(x => x.quantity === 'Fr' && x.value_best == null && x.value_min != null && x.value_max != null && x.value_min !== x.value_max && x.nuclide === 'Cs-137');
const single = data.processing.find(x => x.quantity === 'Fr' && x.value_best == null && x.value_min == null && x.value_max != null && x.nuclide === 'Cs-137');
const go = (rec, variant) => run(null, 'продукт', [['Cs-137', 10]], { processing: { mode: 'record', recordIds: [rec.id], variant } });

test('Fr: нет рекомендованного — середина диапазона, в предупреждении диапазон и слово «скрининг»', () => {
  const r = go(rng, 'best');
  assert.equal(r.rows[0].frUsed, (rng.value_min + rng.value_max) / 2);
  assert.ok(r.warnings.some(w => /середина диапазона/.test(w) && /скрининг/.test(w)));
});

test('Fr: вариант «максимум» — это максимум с пометкой «скрининг»; «минимум» — минимум', () => {
  const r = go(rng, 'max');
  assert.equal(r.rows[0].frUsed, rng.value_max);
  assert.ok(r.warnings.some(w => /вариант «скрининг»/.test(w)));
  assert.equal(go(rng, 'min').rows[0].frUsed, rng.value_min);
});

test('Fr: в источнике одно значение (без минимума) — берётся оно, это не «середина»', () => {
  if (!single) return;
  const r = go(single, 'best');
  assert.equal(r.rows[0].frUsed, single.value_max);
  assert.ok(!r.warnings.some(w => /середина/.test(w)));
});
