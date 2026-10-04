// #FR-73: сравнение дозы от продукта с другими источниками облучения — доза, эквиваленты, добавка к фоновому риску заболеть раком
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { buildComparison, horizonYears, withRadon } from '../src/calc/compare.js';
import { presetRadGear } from '../src/ui/form.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, msg) => assert.ok(Math.abs(a - e) <= 1e-9 * Math.abs(e), `${msg || ''} expected ${e}, got ${a}`);
const E = 60.5e-6;
const totals = (years = 1) => ({ doseSvPerYear: E, doseSvTotal: E * years });
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, riskCoeffPerSv: 0.05, ...over });
const row = (c, id) => c.rows.find(x => x.id === id);

test('взрослый, 1 год: горизонт 50 лет, строки по возрастанию дозы, риск и доля фона', () => {
  const c = buildComparison(data.compare, totals(), inp());
  assert.equal(c.horizonYears, 50);
  assert.deepEqual(c.rows.map(x => x.id), ['flight_3h', 'product', 'med_chest_xray', 'med_mammogram', 'product_horizon', 'med_ct_whole_body', 'bg_natural_world']);
  close(row(c, 'product').doseSv, E);
  close(row(c, 'product').risk, E * 0.05);
  close(row(c, 'product').shareOfBackground, E / (2.4e-3 * 50));
  close(row(c, 'product_horizon').doseSv, E * 50);
  close(row(c, 'bg_natural_world').doseSv, 2.4e-3 * 50);
  assert.equal(row(c, 'bg_natural_world').kind, 'horizon');
  close(row(c, 'med_ct_whole_body').doseSv, 12e-3);
  close(row(c, 'med_ct_whole_body').risk, 12e-3 * 0.05);
});

test('эквиваленты: дни фона, снимки грудной клетки, часы полёта', () => {
  const q = buildComparison(data.compare, totals(), inp()).equivalents;
  close(q.bgDays, E / 2.4e-3 * 365);
  close(q.chestXrays, E / 0.08e-3);
  close(q.flightHours, E / 0.01e-3 * 3);
});

test('добавка к фоновому риску заболеть раком: коэффициент заболеваемости, не r', () => {
  const k = buildComparison(data.compare, totals(), inp()).cancer;
  assert.equal(k.baseline, 0.194);
  assert.equal(k.coeffPerSv, 0.1695);
  close(k.addScenario, E * 0.1695);
  close(k.addBackground, 2.4e-3 * 50 * 0.1695);
  const k2 = buildComparison(data.compare, totals(), inp({ riskCoeffPerSv: 0.057 })).cancer;
  close(k2.addScenario, E * 0.1695);
});

test('ребёнок 5 лет: горизонт до 70 лет возраста, строки «весь горизонт» для продукта нет', () => {
  const c = buildComparison(data.compare, totals(), inp({ age: '5y' }));
  assert.equal(c.horizonYears, 65);
  assert.equal(row(c, 'product_horizon'), undefined);
  close(row(c, 'bg_natural_world').doseSv, 2.4e-3 * 65);
  assert.equal(horizonYears(inp({ age: '3m' })), 70);
  assert.equal(horizonYears(inp({ lifetime: { fromAge: 10, toAge: 70 } })), 60);
});

test('несколько лет: сценарий — доза за весь период; при 50 годах строки «весь горизонт» нет', () => {
  const c = buildComparison(data.compare, totals(10), inp({ years: 10 }));
  close(c.scenarioSv, E * 10);
  close(row(c, 'product').doseSv, E * 10);
  close(row(c, 'product_horizon').doseSv, E * 50);
  close(c.equivalents.bgDays, E * 10 / 2.4e-3 * 365);
  assert.equal(row(buildComparison(data.compare, totals(50), inp({ years: 50 })), 'product_horizon'), undefined);
});

test('нет данных — null; расчёт сценария отдаёт сравнение', () => {
  assert.equal(buildComparison([], totals(), inp()), null);
  assert.equal(buildComparison(data.compare, { doseSvPerYear: null, doseSvTotal: null }, inp()), null);
  const input = presetRadGear();
  const res = computeScenario(data, input);
  assert.ok(res.comparison);
  close(row(res.comparison, 'product').doseSv, input.years > 1 ? res.totals.doseSvTotal : res.totals.doseSvPerYear);
});

test('срок меньше года: сценарий — доза за период, не за год', () => {
  const c = buildComparison(data.compare, totals(0.5), inp({ years: 0.5 }));
  assert.equal(c.multi, true);
  close(c.scenarioSv, E * 0.5);
  close(row(c, 'product').doseSv, E * 0.5);
  assert.notEqual(row(c, 'product_horizon'), undefined);
});

test('нулевая доза: ни одного NaN или Infinity, добавка к раку нулевая', () => {
  const c = buildComparison(data.compare, { doseSvPerYear: 0, doseSvTotal: 0 }, inp());
  for (const r of c.rows) {
    assert.ok(Number.isFinite(r.doseSv) && Number.isFinite(r.risk) && Number.isFinite(r.shareOfBackground));
  }
  assert.equal(row(c, 'product').doseSv, 0);
  assert.equal(c.equivalents.bgDays, 0);
  assert.equal(c.cancer.addScenario, 0);
});

test('запасной горизонт для неизвестного возраста и возраст 12–17 лет', () => {
  assert.equal(horizonYears(inp({ age: 'zzz' })), 50);
  assert.equal(horizonYears(inp({ age: '12-17y' })), 58);
  assert.equal(horizonYears(inp({ age: '10y' })), 60);
  assert.equal(horizonYears(inp({ age: '1y' })), 69);
});

test('природные нуклиды передаются в результат', () => {
  const t = { ...totals(), naturalNuclides: ['K-40'] };
  assert.deepEqual(buildComparison(data.compare, t, inp()).natural, ['K-40']);
  assert.deepEqual(buildComparison(data.compare, totals(), inp()).natural, []);
});

test('withRadon: идентификатор строки по умолчанию и заданный', () => {
  const c = buildComparison(data.compare, totals(), inp());
  const rn = { totalDose_mSv: 100 };
  assert.ok(withRadon(c, rn, 0.05, 'a').rows.some(x => x.id === 'radon_home'));
  const w = withRadon(c, rn, 0.05, 'b', 'radon_world');
  assert.ok(w.rows.some(x => x.id === 'radon_world'));
  assert.equal(w.rows.some(x => x.id === 'radon_home'), false);
  close(w.rows.find(x => x.id === 'radon_world').risk, 100e-3 * 0.05);
});
