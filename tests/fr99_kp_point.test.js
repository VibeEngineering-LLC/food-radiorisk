// #FR-99 v38a: в таблице происхождения чисел КП показан ровно тот, что взят в расчёте (центр; при двух границах — среднее геометрическое; только верхняя граница — она)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
const base = data.transfer.find(r => r.id === 'trs472_tag_cs_137_alpine_grassland_vegetation_sand_sand');
const mk = (id, o) => ({ ...base, id, am: null, gm: null, min: null, max: null, level: '✅', source_anomaly: false, item_ru: 'проба ' + id, item: 'sample', ...o });
const recs = [mk('t_center', { am: 0.02 }), mk('t_both', { min: 0.002, max: 0.008 }), mk('t_only_max', { max: 0.005 }), mk('t_only_min', { min: 0.2 })];
const n = { nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, transferId: 'ALL', transferIds: recs.map(r => r.id), variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } };
const row = computeScenario({ ...data, transfer: [...data.transfer, ...recs] }, inputFor(null, 'черника лесная', [], { dryMatterPercent: 15, nuclides: [n] })).rows[0];
const prov = Object.fromEntries(row.provenance.filter(p => p.step === 'оценка загрязнения (сводная)').map(p => [p.id, p.value]));
const f = base.unit_factor, near = (a, b) => Math.abs(a - b) <= 1e-12 * Math.abs(b);
test('FR-99 v38a: показан КП точки расчёта: центр, среднее геометрическое, верхняя граница', () => {
  assert.ok(near(prov.t_center, 0.02 * f), 'центр');
  assert.ok(near(prov.t_both, Math.sqrt(0.002 * 0.008) * f), 'среднее геометрическое границ, не нижняя граница 0,002');
  assert.ok(near(prov.t_only_max, 0.005 * f), 'только верхняя граница');
  assert.equal(prov.t_only_min, undefined, 'запись только с нижней границей в расчёте не используется и в таблице её нет');
});
test('FR-99 v38a: показанные значения дают те же границы плотности D = A / КП, что взяты в расчёте', () => {
  const d = Object.values(prov).map(v => 1 / v).sort((a, b) => a - b), e = row.depositionEstimate.summary;
  assert.ok(near(e.fullMin, d[0]) && near(e.fullMax, d[d.length - 1]));
});
