// #FR-88 v20 (D-029, уточнения оркестратора по повтору слоя b): А-1, V-1…V-4
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario, listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
const ch = listChoices(data);

function formRun(recId, variant) {
  let raw = S.initialRaw(ch);
  raw = { ...raw, doseSource: 'ICRP119_F1', age: 'adult', dietMode: 'own', portionG: '100', timesPerDay: '1', daysPerWeek: '1', weeksPerMonth: '4', monthsPerYear: '3', years: '1', procMode: 'record', procRecs: [recId], procVar: variant };
  raw = S.setField(raw, ch, 'measuredForm', 'fresh');
  raw = S.setField(raw, ch, 'product', 'Масло сливочное');
  raw.nuclides = [{ ...S.newNuclide('Pb-210'), measured: '1000', unc: '0', transfer: '', transferPicked: true }];
  return computeScenario(data, S.toInput(raw, ch));
}

test('А-1: метод не указан в таблице — best даёт предупреждение, min/max нет', () => {
  const id = 'trs75_butter_method_not_specified_in_the_tabl_pb';
  const rec = data.processing.find(r => r.id === id);
  assert.equal(rec.value_best, null);
  assert.equal(rec.value_min, rec.value_max);
  const rMin = formRun(id, 'min');
  const rMax = formRun(id, 'max');
  const rBest = formRun(id, 'best');
  assert.ok(rMin.ok);
  assert.ok(rMax.ok);
  assert.ok(rBest.ok);
  assert.ok(!rMin.warnings.some(w => /рекомендованного нет/.test(w)), rMin.warnings.join(' | '));
  assert.ok(!rMax.warnings.some(w => /рекомендованного нет/.test(w)), rMax.warnings.join(' | '));
  assert.equal(rBest.warnings.filter(w => /рекомендованного нет/.test(w)).length, 1);
  assert.equal(rMin.rows[0].frUsed, 0.02);
  // то же при прямом вызове ядра (без формы): записи с разбросом (Q3 v19) и без него
  const direct = (variant) => computeScenario(data, inputFor(null, 'Масло сливочное', [['Pb-210', 1000]], { processing: { mode: 'record', recordId: id, variant } }));
  assert.ok(!direct('min').warnings.some(w => /рекомендованного нет/.test(w)));
  assert.ok(!direct('max').warnings.some(w => /рекомендованного нет/.test(w)));
});

// V-1 (обычные Fr перемножаются; накопленная + обычные — наибольшее) закреплён тестом Q2 в tests/fr88_v19.test.js (combineFr: 0.5·0.2 = 0.1; 0.11 против 0.04; 0.04 против 0.5)

test('V-2: K = 5 — пересчёт активности и compliance', () => {
  const r = computeScenario(data, inputFor('milk_products', 'продукт', [['Sr-90', 240]], { product: { name: 'продукт', state: 'dried' }, dryingFactor: 5 }));
  assert.ok(r.ok);
  const row = r.limits.ru[0];
  assert.equal(row.limitId, 't021_p4_r07_sr90');
  assert.equal(row.H, 200);
  assert.equal(row.activity, 240);
  assert.ok(Math.abs(r.limits.compliance.B - 1.2) < 1e-12);
});

test('V-2: K не задан — пометка no_k и отсутствие compliance', () => {
  const r = computeScenario(data, inputFor('milk_products', 'продукт', [['Sr-90', 240]], { product: { name: 'продукт', state: 'dried' } }));
  assert.ok(r.ok);
  assert.equal(r.limits.formNote?.kind, 'no_k');
  assert.equal(r.limits.compliance, null);
});

test('V-3: оценка отложения — выбор min/max по допустимым коэффициентам', () => {
  const base = data.transfer.find(r => r.id === 'trs472_tag_cs_137_alpine_grassland_vegetation_sand_sand');
  const mk = (id, over) => ({ ...base, id, am: null, gm: null, min: null, max: null, level: '✅', source_anomaly: false, item_ru: 'проба', item: 'sample', ...over });
  const recs = [mk('t_center', { am: 0.02 }), mk('t_only_max', { max: 0.005 }), mk('t_only_min', { min: 0.2 })];
  const d2 = { ...data, transfer: [...data.transfer, ...recs] };
  const n = { nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, transferId: 'ALL', transferIds: recs.map(r => r.id), variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } };
  const e = computeScenario(d2, inputFor(null, 'черника лесная', [], { dryMatterPercent: 15, nuclides: [n] })).rows[0].depositionEstimate;
  const f = base.unit_factor;
  const dep = (c) => 1000 / (1000 * c * f);
  assert.equal(e.summary.used, 2);
  assert.equal(e.summary.fullMin, Math.min(dep(0.02), dep(0.005)));
  assert.equal(e.summary.fullMax, Math.max(dep(0.02), dep(0.005)));
  assert.ok(e.summary.fullMax !== dep(0.2));
});

test('V-2: K не задан, самая строгая строка — «сухая» (подмена данных): вердикта всё равно нет', () => {
  const d2 = { ...data, limits_ru: data.limits_ru.map(r => (r.id === 't021_p4_r07_sr90' ? { ...r, value: 10 } : r)) };
  const r = computeScenario(d2, inputFor('milk_products', 'продукт', [['Sr-90', 240]], { product: { name: 'продукт', state: 'dried' } }));
  assert.equal(r.limits.ru[0].limitId, 't021_p4_r07_sr90');
  assert.equal(r.limits.formNote?.kind, 'no_k');
  assert.equal(r.limits.compliance, null);
});

test('V-4: запись ЕС с группой «прочие» для Cs-137', () => {
  const r = computeScenario(data, inputFor('milk_products', 'молоко', [['Cs-137', 100], ['Po-210', 500], ['Pb-210', 500]]));
  assert.ok(r.ok);
  const g = r.limits.foreign.find(f => f.id === 'eu_2016_52_a1_other_cs_infant') || r.limits.foreign.find(f => /2016\/52/.test(f.document) && f.nuclides.includes('Cs-137'));
  assert.ok(g, 'запись ЕС с группой «прочие» найдена');
  assert.deepEqual(g.nuclides, ['Cs-137']);
  assert.equal(g.activity, 100);
});
