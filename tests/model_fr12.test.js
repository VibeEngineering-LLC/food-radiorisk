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
const base = (over = {}) => ({ age: 'adult', doseSource: 'ICRP119_F1', portionKg: 0.1, portionsPerYear: 10, years: 1, constantActivity: true, eatDate: null, dryMatterPercent: null, product: { name: 'черника лесная', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides: [nuc()], ...over });

test('риск: пренебрежимо малый', () => {
    const r = computeScenario(data, base({ nuclides: [nuc({ measuredBqPerKg: 10 })] }));
    assert.ok(r.totals.doseMaxYearTech <= r.totals.optimNegligibleSv);
});

test('риск: выше уровня для населения', () => {
    // #FR-42: уровень НРБ п. 2.3 — пожизненный риск от облучения за ОДИН год; годовая доза здесь 1,3 мЗв → риск ≈ 7·10⁻⁵
    const r = computeScenario(data, base({ years: 5, portionsPerYear: 200, nuclides: [nuc({ measuredBqPerKg: 5000 })] }));
    assert.ok(r.totals.doseMaxYearTech > r.totals.limitYearSv);
    close(r.totals.riskMaxYear, r.totals.riskPerYear, 1e-12);
});

test('риск: число лет не меняет уровень (с уровнем сравнивается риск от одного года)', () => {
    const one = computeScenario(data, base({ years: 5, portionsPerYear: 100, nuclides: [nuc({ measuredBqPerKg: 5000 })] }));
    const fifty = computeScenario(data, base({ years: 50, portionsPerYear: 100, nuclides: [nuc({ measuredBqPerKg: 5000 })] }));
    close(fifty.totals.doseMaxYearTech, one.totals.doseMaxYearTech, 1e-12);
    close(fifty.totals.riskMaxYear, one.totals.riskMaxYear, 1e-12); // риск года — не от срока
});

test('риск: между уровнями', () => {
    const r = computeScenario(data, base({ years: 10, portionsPerYear: 20, nuclides: [nuc({ measuredBqPerKg: 1000 })] }));
    assert.ok(r.totals.riskTotal > 1e-6);
    assert.ok(r.totals.riskTotal <= 5e-5);
    assert.ok(r.totals.doseMaxYearTech > r.totals.optimNegligibleSv && r.totals.doseMaxYearTech <= r.totals.limitYearSv);
});

test('нормы: сушёные ягоды — 800, свежие — 160', () => {
    const rDried = computeScenario(data, base({ foodGroupCode: 'berries_wild', product: { name: 'черника лесная', state: 'dried' } }));
    assert.equal(rDried.limits.ru[0].H, 800);
    const rFresh = computeScenario(data, base({ foodGroupCode: 'berries_wild' }));
    assert.equal(rFresh.limits.ru[0].H, 160);
});

test('обработка без рекомендованного Fr — середина диапазона с предупреждением (максимум — вариант «скрининг», fr81_fr_mid.test.js)', () => {
    const rec = data.processing.find(x => x.quantity === 'Fr' && x.value_best == null && x.value_max != null && x.value_min != null && x.value_min !== x.value_max && x.nuclide === 'Cs-137');
    assert.ok(rec);
    const r = computeScenario(data, base({ processing: { mode: 'record', fr: 1, recordId: rec.id, variant: 'best' } }));
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some(w => w.includes('середина диапазона')));
});

test('обработка: вариант «минимум» не подменяется', () => {
    const rec = data.processing.find(x => x.quantity === 'Fr' && x.value_best == null && x.value_min != null && x.value_max != null && x.nuclide === 'Cs-137');
    assert.ok(rec);
    const r = computeScenario(data, base({ processing: { mode: 'record', fr: 1, recordId: rec.id, variant: 'min' } }));
    assert.equal(r.rows[0].frUsed, rec.value_min);
    assert.ok(!r.warnings.some(w => w.includes('середина диапазона')));
});
