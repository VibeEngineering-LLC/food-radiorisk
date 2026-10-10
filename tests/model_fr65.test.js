import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { presetRadGear, buildInput, lifetimeOf } from '../src/ui/form.js';
import { initialRaw, setField, rawFromInput } from '../src/react/formState.js';
import { listChoices } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const ch = listChoices(data);
const e = Object.fromEntries(data.dose_coeff.filter(r => r.nuclide === 'Cs-137' && r.source === 'ICRP119_F1').map(r => [r.age, r.value]));
const YRS = { '3m': 1, '1y': 1, '5y': 5, '10y': 5, '15y': 5, adult: 53 };
const withLife = (start) => ({ ...presetRadGear(), constantActivity: true, lifetime: { fromAge: start, toAge: 70 }, years: 70 - start });

test('режим до 70 лет: доза за жизнь = поступление × Σ(годы × e по группам), независимый пересчёт', () => {
  const r = computeScenario(data, withLife(0));
  assert.equal(r.ok, true);
  const row = r.rows[0];
  const expected = row.intakeBqPerYear * Object.entries(YRS).reduce((s, [a, y]) => s + y * e[a], 0);
  assert.ok(Math.abs(row.doseSvTotal - expected) <= 1e-12 * expected);
  assert.equal(row.lifetimeBands.length, 6);
  assert.ok(r.warnings.some(w => /до|0–70|0.70/.test(w) && /e\(g\)/.test(w)));
});

test('без режима: доза за период = за год × годы, полос нет', () => {
  const r = computeScenario(data, { ...presetRadGear(), constantActivity: true, years: 10 });
  assert.equal(r.rows[0].lifetimeBands, null);
  assert.ok(Math.abs(r.rows[0].doseSvTotal - 10 * r.rows[0].doseSvPerYear) < 1e-18);
});

test('форма: lifeMode даёт lifetime/years/age; не-ICRP119 или возраст ≥70 — режим не выключается молча', () => {
  const raw = setField(setField(initialRaw(ch), ch, 'lifeMode', true), ch, 'startAge', '10');
  const inp = buildInput(raw);
  assert.deepEqual(inp.lifetime, { fromAge: 10, toAge: 70 });
  assert.equal(inp.years, 60);
  assert.equal(inp.age, '10y');
  assert.deepEqual(lifetimeOf({ ...raw, doseSource: 'NRB2009_App2' }), { fromAge: 10, toAge: 70, startBand: '10y' });
  assert.equal(buildInput({ ...raw, lifeMode: false }).lifetime, null);
  assert.equal(rawFromInput(inp, ch).lifeMode, true);
});

test('ПГП без режима — по e выбранного возраста (режим «с a до b» — fr81_pgp_group.test.js)', () => {
  const plain = computeScenario(data, { ...presetRadGear(), years: 10 }).rows[0];
  assert.ok(Math.abs(plain.pgpBqPerYear - 1e-3 / plain.eSvPerBq) <= 1e-9 * plain.pgpBqPerYear);
});
