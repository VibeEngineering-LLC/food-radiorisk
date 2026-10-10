// #FR-81 V4-2 (с v19 — D-029, Q1): запись Fr «радионуклиды (не уточнено)» к нуклиду не применяется; запись для своего элемента применяется без такого сообщения
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { buildReport } from '../src/ui/report.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const ISO = '2026-10-06T00:00:00.000Z';
const make = (id, nuc, group = 'milk_products') => inputFor(group, 'Сметана', nuc, { processing: { mode: 'record', recordId: id, variant: 'best' } });
const generic = (r) => r.warnings.filter(w => /коэффициент Fr дан для радионуклидов вообще/.test(w));
// запись «не уточнено» к нуклиду не применяется (D-029, Q1) — см. tests/fr88_v19.test.js

test('V4-2: запись для своего элемента — предупреждения про «радионуклиды вообще» нет', () => {
  const r = computeScenario(data, make('trs75_sour_cream_method_not_specified_in_the_tabl_cs', [['Cs-137', 100]]));
  assert.equal(r.ok, true);
  assert.equal(generic(r).length, 0);
});
