// #FR-81 V4-3: вариант «минимум/максимум» у записи без рекомендованного и без разброса — то же единственное значение, предупреждение «рекомендованного нет» не пропадает (и при прямом вызове ядра)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';

const calc = (id, variant) => computeScenario(data, inputFor('milk_products', 'Сливки', [['Cs-137', 100]], { processing: { mode: 'record', recordId: id, variant } }));
const noBest = (r) => r.warnings.filter(w => /рекомендованного нет/.test(w));
const NO_SPREAD = 'trs75_cream_method_not_specified_in_the_tabl_pb_zn';
const RANGE = 'trs69_vegetables_berries_and_f_peeling_of_vegetables_cs'; // Cs, 0,5–0,9 (запись lysenko17_meat_boil_2kg_1h «не уточнено» с v19 к Cs-137 не применяется)

test('V4-3: запись без разброса (Fr = 0,05), вариант «минимум» и «максимум» — предупреждение есть, доза та же, что у рекомендованного', () => {
  const best = calc(NO_SPREAD, 'best');
  assert.match(noBest(best)[0], /в источнике одно значение Fr = 0\.05 \(рекомендованного нет\)/); // «рекомендованное» без выбора — предупреждение остаётся
  for (const v of ['min', 'max']) {
    const r = calc(NO_SPREAD, v);
    assert.equal(r.ok, true);
    assert.equal(r.rows[0].doseSvTotal, best.rows[0].doseSvTotal);
  }
});

test('V4-3: запись с диапазоном — «минимум» остаётся минимумом (без пометки «одно значение»), «максимум» — скринингом', () => {
  const lo = calc(RANGE, 'min');
  const hi = calc(RANGE, 'max');
  assert.equal(noBest(lo).length, 0);
  assert.equal(noBest(hi).length, 0);
  assert.ok(hi.warnings.some(w => /вариант «скрининг»/.test(w)));
  assert.ok(Math.abs(lo.rows[0].doseSvTotal / hi.rows[0].doseSvTotal - 0.5 / 0.9) < 1e-9);
});
