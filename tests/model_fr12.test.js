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
const base = (over = {}) => ({ age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 10, years: 1, eatDate: null, dryMatterPercent: null, product: { name: 'черника', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides: [nuc()], ...over });

test('риск: пренебрежимо малый', () => {
    const r = computeScenario(data, base({ nuclides: [nuc({ measuredBqPerKg: 10 })] }));
    assert.equal(r.totals.riskAssessment.level, 'negligible');
    assert.equal(r.totals.riskAssessment.negligible.id, 'nrb2009_p23_negligible_risk');
});

test('риск: выше уровня для населения', () => {
    // #FR-42: уровень НРБ п. 2.3 — пожизненный риск от облучения за ОДИН год; годовая доза здесь 1,3 мЗв → риск ≈ 7·10⁻⁵
    const r = computeScenario(data, base({ years: 1, portionsPerYear: 200, nuclides: [nuc({ measuredBqPerKg: 5000 })] }));
    assert.equal(r.totals.riskAssessment.level, 'exceeds');
    assert.equal(r.totals.riskAssessment.limit.id, 'nrb2009_p23_lifetime_risk_pop');
    close(r.totals.riskAssessment.oneIn, 1 / r.totals.riskPerYear, 1e-12);
});

test('риск: число лет не меняет уровень (с уровнем сравнивается риск от одного года)', () => {
    const one = computeScenario(data, base({ years: 1, portionsPerYear: 100, nuclides: [nuc({ measuredBqPerKg: 5000 })] }));
    const fifty = computeScenario(data, base({ years: 50, portionsPerYear: 100, nuclides: [nuc({ measuredBqPerKg: 5000 })] }));
    assert.equal(fifty.totals.riskAssessment.level, one.totals.riskAssessment.level);
    close(fifty.totals.riskAssessment.oneIn, one.totals.riskAssessment.oneIn, 1e-12); // «1 на N» — от одного года, не от 50 лет
    close(fifty.totals.riskAssessment.oneInTotal, one.totals.riskAssessment.oneIn / 50, 1e-9);
});

test('риск: между уровнями', () => {
    const r = computeScenario(data, base({ years: 10, portionsPerYear: 20, nuclides: [nuc({ measuredBqPerKg: 1000 })] }));
    assert.ok(r.totals.riskTotal > 1e-6);
    assert.ok(r.totals.riskTotal <= 5e-5);
    assert.equal(r.totals.riskAssessment.level, 'within');
});

test('нормы: сушёные ягоды — 800, свежие — 160', () => {
    const rDried = computeScenario(data, base({ foodGroupCode: 'berries_wild', product: { name: 'черника', state: 'dried' } }));
    assert.equal(rDried.limits.ru[0].H, 800);
    const rFresh = computeScenario(data, base({ foodGroupCode: 'berries_wild' }));
    assert.equal(rFresh.limits.ru[0].H, 160);
});

test('обработка без рекомендованного Fr — максимум диапазона с предупреждением', () => {
    const rec = data.processing.find(x => x.quantity === 'Fr' && x.value_best == null && x.value_max != null && x.nuclide === 'Cs-137');
    assert.ok(rec);
    const r = computeScenario(data, base({ processing: { mode: 'record', fr: 1, recordId: rec.id, variant: 'best' } }));
    assert.equal(r.ok, true);
    assert.equal(r.rows[0].frUsed, rec.value_max);
    assert.ok(r.warnings.some(w => w.includes('максимум диапазона')));
});

test('обработка: вариант «минимум» не подменяется', () => {
    const rec = data.processing.find(x => x.quantity === 'Fr' && x.value_best == null && x.value_min != null && x.value_max != null && x.nuclide === 'Cs-137');
    assert.ok(rec);
    const r = computeScenario(data, base({ processing: { mode: 'record', fr: 1, recordId: rec.id, variant: 'min' } }));
    assert.equal(r.rows[0].frUsed, rec.value_min);
    assert.ok(!r.warnings.some(w => w.includes('максимум диапазона')));
});
