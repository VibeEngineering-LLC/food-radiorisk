import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const recs = data.processing.filter(r => r.quantity === 'Fr' && r.value_best != null && r.cumulative == null && r.nuclide === 'Cs-137').slice(0, 2);
const nuc = { nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: null, depositionKBqPerM2: null, depositionDate: null, transferId: null, variant: 'central' };
const run = (processing) => computeScenario(data, { age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 1, years: 1, eatDate: null, dryMatterPercent: null, product: { name: 'x', state: 'fresh' }, processing, foodGroupCode: null, nuclides: [nuc] }).rows[0].frUsed;
test('два способа обработки: Fr — произведение', () => {
  assert.equal(recs.length, 2);
  const f = run({ mode: 'record', recordIds: recs.map(r => r.id), variant: 'best' });
  assert.ok(Math.abs(f - recs[0].value_best * recs[1].value_best) < 1e-12);
});
test('один способ в recordIds и в recordId дают одно и то же', () => {
  assert.equal(run({ mode: 'record', recordIds: [recs[0].id], variant: 'best' }), run({ mode: 'record', recordId: recs[0].id, variant: 'best' }));
});
