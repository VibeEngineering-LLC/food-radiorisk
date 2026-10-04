// #FR-73: строка «радон дома» в сравнении — доза из модуля src/vendor/radon_risk (МКРЗ 137), риск тем же r
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { buildComparison, withRadon, startAge } from '../src/calc/compare.js';
import { radonRisk } from '../src/vendor/radon_risk/radonRisk.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, rel = 1e-9) => assert.ok(Math.abs(a - e) <= rel * Math.abs(e), `expected ${e}, got ${a}`);
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, riskCoeffPerSv: 0.05, ...over });
const cmp = () => buildComparison(data.compare, { doseSvPerYear: 60.5e-6, doseSvTotal: 60.5e-6 }, inp());

test('радон 100 Бк/м³, взрослый 50 лет: доза модуля 222,6 мЗв, риск = доза × r, строка последняя по дозе', () => {
  const c = cmp();
  const rn = radonRisk({ C: 100, years: c.horizonYears, ageStart: startAge(inp()), smoking: 'never' });
  close(rn.totalDose_mSv, 222.6, 5e-4); // контрольное значение владельца модуля
  const w = withRadon(c, rn, 0.05, 'Радон дома');
  const row = w.rows.find(x => x.id === 'radon_home');
  close(row.doseSv, rn.totalDose_mSv * 1e-3);
  close(row.risk, row.doseSv * 0.05);
  close(row.shareOfBackground, row.doseSv / (2.4e-3 * 50));
  assert.equal(w.rows.at(-1).id, 'radon_home');
  assert.equal(w.rows.length, c.rows.length + 1);
  assert.equal(c.rows.some(x => x.id === 'radon_home'), false); // исходное сравнение не меняется
});

test('возраст начала облучения; без данных радона сравнение не меняется', () => {
  assert.equal(startAge(inp()), 18);
  assert.equal(startAge(inp({ age: '5y' })), 5);
  assert.equal(startAge(inp({ lifetime: { fromAge: 10, toAge: 70 } })), 10);
  const c = cmp();
  assert.equal(withRadon(c, null, 0.05, 'x'), c);
  assert.equal(withRadon(null, { totalDose_mSv: 1 }, 0.05, 'x'), null);
});
