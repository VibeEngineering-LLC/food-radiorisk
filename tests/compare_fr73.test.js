// #FR-73: сравнение дозы от продукта с другими источниками облучения — доза, эквиваленты, добавка к фоновому риску заболеть раком
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { buildComparison, horizonYears, withRadon, withDwelling } from '../src/calc/compare.js';
import { presetRadGear } from '../src/ui/form.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, msg) => assert.ok(Math.abs(a - e) <= 1e-9 * Math.abs(e), `${msg || ''} expected ${e}, got ${a}`);
const E = 60.5e-6;
const totals = (years = 1) => ({ doseSvPerYear: E, doseSvTotal: E * years });
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, riskCoeffPerSv: 0.05, ...over });
const row = (c, id) => c.rows.find(x => x.id === id);

test('взрослый, 1 год: горизонт 50 лет, разовые по возрастанию дозы, фон после них, риск', () => {
  const c = buildComparison(data.compare, totals(), inp(), 0.05);
  assert.equal(c.horizonYears, 50);
  assert.deepEqual(c.rows.map(x => x.id), ['flight_3h', 'product', 'med_chest_xray', 'med_mammogram', 'med_ct_chest', 'med_ct_whole_body', 'bg_natural_world', 'bg_street']);
  close(row(c, 'product').doseSv, E);
  assert.equal('shareOfBackground' in row(c, 'product'), false);
  close(row(c, 'med_ct_chest').doseSv, 7e-3);
  close(row(c, 'bg_natural_world').doseSv, 2.4e-3 * 50);
  assert.equal(row(c, 'bg_natural_world').kind, 'horizon');
  close(row(c, 'med_ct_whole_body').doseSv, 12e-3);
});

test('эквиваленты: дни фона, снимки грудной клетки, часы полёта', () => {
  const q = buildComparison(data.compare, totals(), inp(), 0.05).equivalents;
  close(q.bgDays, E / 2.4e-3 * 365);
  close(q.chestXrays, E / 0.08e-3);
  close(q.flightHours, E / 0.01e-3 * 3);
});

test('ребёнок 5 лет: горизонт до 70 лет возраста', () => {
  const c = buildComparison(data.compare, totals(), inp({ age: '5y' }), 0.05);
  assert.equal(c.horizonYears, 65);
  close(row(c, 'bg_natural_world').doseSv, 2.4e-3 * 65);
  assert.equal(horizonYears(inp({ age: '3m' })), 70);
  assert.equal(horizonYears(inp({ lifetime: { fromAge: 10, toAge: 70 } })), 60);
});

test('несколько лет: сценарий — доза за весь период', () => {
  const c = buildComparison(data.compare, totals(10), inp({ years: 10 }), 0.05);
  close(c.scenarioSv, E * 10);
  close(row(c, 'product').doseSv, E * 10);
  close(c.equivalents.bgDays, E * 10 / 2.4e-3 * 365);
});

test('нет данных — null; расчёт сценария отдаёт сравнение', () => {
  assert.equal(buildComparison([], totals(), inp(), 0.05), null);
  assert.equal(buildComparison(data.compare, { doseSvPerYear: null, doseSvTotal: null }, inp(), 0.05), null);
  const input = presetRadGear();
  const res = computeScenario(data, input);
  assert.ok(res.comparison);
  close(row(res.comparison, 'product').doseSv, input.years > 1 ? res.totals.doseSvTotal : res.totals.doseSvPerYear);
});

test('срок меньше года: сценарий — доза за период, не за год', () => {
  const c = buildComparison(data.compare, totals(0.5), inp({ years: 0.5 }), 0.05);
  assert.equal(c.multi, true);
  close(c.scenarioSv, E * 0.5);
  close(row(c, 'product').doseSv, E * 0.5);
});

test('нулевая доза: ни одного NaN или Infinity, добавка к раку нулевая', () => {
  const c = buildComparison(data.compare, { doseSvPerYear: 0, doseSvTotal: 0 }, inp(), 0.05);
  for (const r of c.rows) {
    assert.ok(Number.isFinite(r.doseSv) && !('risk' in r)); // #FR-81 V09: у строк сравнения риска нет
  }
  assert.equal(row(c, 'product').doseSv, 0);
  assert.equal(c.equivalents.bgDays, 0);
});

test('запасной горизонт для неизвестного возраста и возраст 12–17 лет', () => {
  assert.equal(horizonYears(inp({ age: 'zzz' })), 50);
  assert.equal(horizonYears(inp({ age: '12-17y' })), 58);
  assert.equal(horizonYears(inp({ age: '10y' })), 60);
  assert.equal(horizonYears(inp({ age: '1y' })), 69);
});

test('природные нуклиды передаются в результат', () => {
  const t = { ...totals(), naturalNuclides: ['K-40'] };
  assert.deepEqual(buildComparison(data.compare, t, inp(), 0.05).natural, ['K-40']);
  assert.deepEqual(buildComparison(data.compare, totals(), inp(), 0.05).natural, []);
});

test('withRadon: идентификатор строки по умолчанию и заданный', () => {
  const c = buildComparison(data.compare, totals(), inp(), 0.05);
  const rn = { totalDose_mSv: 100 };
  assert.ok(withRadon(c, rn, 0.05, 'a').rows.some(x => x.id === 'radon_home'));
  const w = withRadon(c, rn, 0.05, 'b', 'radon_world');
  assert.ok(w.rows.some(x => x.id === 'radon_world'));
  assert.equal(w.rows.some(x => x.id === 'radon_home'), false);
});

test('фон в жилище: мкЗв/ч × 7000 ч × 1 × горизонт; строки фон, жилище, радон — в конце и в этом порядке', () => {
  const c = buildComparison(data.compare, totals(), inp(), 0.05);
  assert.deepEqual(c.dwell && [c.dwell.hours, c.dwell.h10ToE, c.dwell.source], [7000, 1, 'MUK_1088']);
  const d = withDwelling(c, 0.15, 0.05, 'жилище');
  const dw = row(d, 'dwelling');
  close(dw.doseSv, 0.15e-6 * 7000 * 50);
  assert.equal(dw.kind, 'horizon');
  const w = withRadon(d, { totalDose_mSv: 1 }, 0.05, 'радон');
  assert.deepEqual(w.rows.slice(-4).map(x => x.id), ['bg_natural_world', 'bg_street', 'dwelling', 'radon_home']);
  const k = buildComparison(data.compare, totals(), inp({ age: '5y' }), 0.05);
  close(row(withDwelling(k, 0.15, 0.05, 'x'), 'dwelling').doseSv, 0.15e-6 * 7000 * 65);
});

test('фон в жилище: пустой, нулевой или отрицательный ввод — строки нет', () => {
  const c = buildComparison(data.compare, totals(), inp(), 0.05);
  assert.equal(withDwelling(c, NaN, 0.05, 'x'), c);
  assert.equal(withDwelling(c, 0, 0.05, 'x'), c);
  assert.equal(withDwelling(c, -0.1, 0.05, 'x'), c);
  assert.equal(withDwelling(null, 0.15, 0.05, 'x'), null);
  assert.equal(withDwelling({ ...c, dwell: null }, 0.15, 0.05, 'x').rows.some(x => x.id === 'dwelling'), false);
});

test('большая доза продукта: продукт среди разовых, природный фон всё равно после них', () => {
  const c = buildComparison(data.compare, { doseSvPerYear: 1, doseSvTotal: 1 }, inp(), 0.05);
  assert.deepEqual(c.rows.slice(-3).map(x => x.id), ['product', 'bg_natural_world', 'bg_street']);
});

test('фон в жилище: параметры берутся из записей, риск — по переданному r', () => {
  const recs = data.compare.map(x => x.id === 'dwell_h10_to_e' ? { ...x, value: 0.7 } : x.id === 'dwell_hours' ? { ...x, value: 1000 } : x);
  const c = buildComparison(recs, totals(), inp(), 0.05);
  const dw = row(withDwelling(c, 0.2, 0.1, 'x'), 'dwelling');
  close(dw.doseSv, 0.2e-6 * 1000 * 0.7 * 50);
});

test('постоянные источники не сортируются по дозе: порядок записей', () => {
  const extra = { ...data.compare.find(x => x.id === 'bg_natural_world'), id: 'zz_small', value: 0.1 };
  const c = buildComparison([...data.compare, extra], totals(), inp(), 0.05);
  assert.deepEqual(c.rows.slice(-3).map(x => x.id), ['bg_natural_world', 'bg_street', 'zz_small']);
});
