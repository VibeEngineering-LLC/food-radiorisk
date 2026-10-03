import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
function close(actual, expected, rel, msg) { assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), `${msg || ''} expected ${expected}, got ${actual}`); }
const nuc = (extra = {}) => ({ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: null, transferId: null, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 }, ...extra });
// аудит audit/risk-fields-review-2026-10-03.md: F1 (r = 0,05), F3 (природные не нормируются), F6 (70 мЗв за 70 лет)
const base = (nuclides, over = {}) => ({ age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.05, portionKg: 0.1, portionsPerYear: 10, years: 17, eatDate: null, dryMatterPercent: null, product: { name: 'орехи', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides, ...over });
const eOf = (n) => data.dose_coeff.find(r => r.nuclide === n && r.age === 'adult' && r.source === 'ICRP119_F1').value;

test('смесь: доли норм только по техногенной части, природные перечислены отдельно', () => {
  const r = computeScenario(data, base([nuc(), nuc({ nuclide: 'Ra-226', measuredBqPerKg: 30 })]));
  const cs = 1000 * 1 * eOf('Cs-137');
  close(r.totals.techDoseSvPerYear, cs, 1e-12);
  close(r.totals.budgetShare1mSv, cs / 1e-3, 1e-12);
  close(r.totals.lifeShare70mSv, cs * 17 / 70e-3, 1e-12);
  assert.deepEqual(r.totals.techNuclides, ['Cs-137']);
  assert.deepEqual(r.totals.naturalNuclides, ['Ra-226']);
  assert.ok(r.totals.doseSvPerYear > r.totals.techDoseSvPerYear);
});

test('только природные: доли норм и ПГП не определены', () => {
  const r = computeScenario(data, base([nuc({ nuclide: 'Th-232', measuredBqPerKg: 30 }), nuc({ nuclide: 'K-40', measuredBqPerKg: 100 })]));
  assert.equal(r.totals.budgetShare1mSv, null);
  assert.equal(r.totals.lifeShare70mSv, null);
  assert.ok(r.rows.every(x => x.natural && x.pgpBqPerYear === null && x.pgpShare === null));
});

test('r = 0,05: годовая доза 1 мЗв даёт ровно уровень НРБ 5·10⁻⁵ (шкала и проценты согласованы)', () => {
  const r = computeScenario(data, base([nuc({ measuredBqPerKg: 1e-3 / eOf('Cs-137') })], { years: 1 }));
  close(r.totals.budgetShare1mSv, 1, 1e-12);
  close(r.totals.riskPerYear, 5e-5, 1e-12);
  assert.equal(r.totals.riskAssessment.level, 'within');
});

// #FR-70: коэффициент риска для взрослых (4,1·10⁻²) ребёнку не подходит — предупреждение
test('коэффициент для взрослых и возраст ребёнка: предупреждение; для взрослого и r = 0,055 — нет', () => {
  const w = (o) => computeScenario(data, base([nuc()], o)).warnings.filter(x => x.includes('коэффициент риска для взрослых'));
  assert.equal(w({ age: '5y', riskCoeffPerSv: 0.041 }).length, 1);
  assert.equal(w({ age: 'adult', riskCoeffPerSv: 0.041 }).length, 0);
  assert.equal(w({ age: '5y', riskCoeffPerSv: 0.055 }).length, 0);
});

// #FR-71: США, питьевая вода — MCL (40 CFR 141.66) и бутилированная вода (21 CFR 165.110) показываются как обязательные нормы
test('вода: Sr-90 и Ra-226 сравниваются с нормами США (Бк/л), обязательные — выше ориентиров', () => {
  const r = computeScenario(data, base([nuc({ nuclide: 'Sr-90', measuredBqPerKg: 0.1 }), nuc({ nuclide: 'Ra-226', measuredBqPerKg: 0.37 })], { foodGroupCode: 'water' }));
  const us = r.limits.foreign.filter(f => f.jurisdiction === 'USA');
  const sr = us.find(f => f.id === 'us_epa_mcl_sr90_tableA'), ra = us.filter(f => /ra226_228/.test(f.id));
  close(sr.ratio, 0.1 / 0.296, 1e-12); assert.equal(sr.force.rank, 0);
  assert.equal(ra.length, 2); assert.ok(ra.every(f => f.force.rank === 0)); close(ra[0].ratio, 0.37 / 0.185, 1e-12);
  assert.equal(computeScenario(data, base([nuc({ nuclide: 'Sr-90', measuredBqPerKg: 0.1 })])).limits.foreign.filter(f => /^us_(epa|fda_bottled)/.test(f.id)).length, 0);
});
