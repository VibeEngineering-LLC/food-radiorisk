import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const nuc = { nuclide: 'Cs-137', source: 'deposition', depositionKBqPerM2: 100, transferId: 'perevolotsky2006_t69_kp_cs137_porcini_A2', variant: 'central', measuredBqPerKg: null, measuredUncertaintyBqPerKg: 0, sampleDate: null, depositionDate: null };
const base = (state, dryingFactor) => ({ age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 1, years: 1, eatDate: null, dryMatterPercent: null, dryingFactor, product: { name: 'белый гриб', state }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides: [nuc] });
test('P-006: плотность → сушёный продукт — активность свежего × коэффициент концентрирования при сушке', () => {
  const fresh = computeScenario(data, base('fresh', null)), dried = computeScenario(data, base('dried', 5));
  assert.ok(dried.ok, dried.errors?.join(' '));
  assert.ok(Math.abs(dried.rows[0].rawBqPerKg - 5 * fresh.rows[0].rawBqPerKg) < 1e-9 * fresh.rows[0].rawBqPerKg);
  assert.ok(dried.rows[0].provenance.some(p => p.step === 'концентрирование при сушке' && p.value === 5));
});
test('P-006: плотность → сушёный продукт без коэффициента концентрирования при сушке — ошибка', () => {
  const r = computeScenario(data, base('dried', null));
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(' ').includes('концентрирования при сушке'));
});
