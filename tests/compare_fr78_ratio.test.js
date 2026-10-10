// #FR-78: колонка «Во сколько раз больше дозы от продукта» — функция productRatios из src/calc/compare.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { buildComparison, withRadon, withDwelling, productRatios } from '../src/calc/compare.js';
import { fmtTimes } from '../src/ui/fmt.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, msg) => assert.ok(Math.abs(a - e) <= 1e-9 * Math.abs(e), `${msg || ''} expected ${e}, got ${a}`);
const E = 60.5e-6;
const totals = { doseSvPerYear: E, doseSvTotal: E };
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, riskCoeffPerSv: 0.05, ...over });

test('отношение к дозе продукта: доза строки / доза продукта, самого продукта в словаре нет', () => {
    const c = buildComparison(data.compare, totals, inp(), 0.05);
    const q = productRatios(c);
    assert.equal('product' in q, false);
    close(q.bg_natural_world, (2.4e-3 * 50) / E);
    close(q.bg_street, (0.16504e-3 * 50) / E);
    close(q.med_ct_chest, 7e-3 / E);
    close(q.flight_3h, 0.01e-3 / E);
    assert.ok(q.flight_3h < 1 && q.bg_natural_world > 1);
    assert.equal(Object.keys(q).length, c.rows.length - 1);
    const w = withRadon(withDwelling(c, 0.15, 0.05, 'x'), { totalDose_mSv: 1 }, 0.05, 'радон');
    close(productRatios(w).radon_home, 1e-3 / E);
    close(productRatios(w).dwelling, (0.15e-6 * 7000 * 50) / E);
});

test('продукт за несколько лет: делитель — доза строки product; нулевая доза и пустой вход — null', () => {
    const m = buildComparison(data.compare, { doseSvPerYear: E, doseSvTotal: 3 * E }, inp({ years: 3 }), 0.05);
    close(productRatios(m).med_ct_chest, 7e-3 / (3 * E));
    assert.equal(productRatios(buildComparison(data.compare, { doseSvPerYear: 0, doseSvTotal: 0 }, inp(), 0.05)), null);
    assert.equal(productRatios(null), null);
    assert.equal(productRatios({ rows: [{ id: 'flight_3h', doseSv: 1e-5 }] }), null);
});

test('формат ячейки: ×3 300, ×104, ×0,15 — три значащие цифры, десятичная запятая', () => {
    assert.equal(fmtTimes(3300.4), '×3 300');
    assert.equal(fmtTimes(104.2), '×104');
    assert.equal(fmtTimes(0.152), '×0,152');
    assert.equal(fmtTimes(0.15), '×0,15');
    assert.equal(fmtTimes(12345.6), '×12 300');
    assert.equal(fmtTimes(NaN), '—');
});
