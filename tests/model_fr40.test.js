// #FR-40: зарубежные нормы — по силе документа: обязательные государственные акты вверху, утратившие силу внизу
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const r = computeScenario(data, { age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 10, years: 1, eatDate: null,
  dryMatterPercent: null, product: { name: 'черника лесная', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null,
  nuclides: [{ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } }] });

test('ранги не убывают; первая — обязательный акт', () => {
  const ranks = r.limits.foreign.map(f => f.force.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(r.limits.foreign[0].force.rank, 0);
});
// #FR-52 / #FR-60: утратившие силу не показываются; аварийные уровни показываются с пометкой силы документа
test('нет утративших силу; аварийные нормы есть и помечены', () => {
  assert.ok(r.limits.foreign.length > 0);
  const doc = (f) => data.limits_foreign.find(x => x.id === f.id);
  assert.ok(r.limits.foreign.every(f => !/^(заменён|утратил|истёк)/.test(doc(f).status)));
  assert.ok(r.limits.foreign.every(f => !/560\.750/.test(f.document)));
  const dil = r.limits.foreign.find(f => /555\.880/.test(f.document));
  assert.ok(dil, 'FDA DIL показан');
  assert.equal(dil.force.rank, 1);
  assert.match(dil.force.label, /не предел/);
  assert.equal(dil.emergency, true);
  assert.ok(r.limits.foreign.some(f => f.emergency === false), 'нормы действующей ситуации остались');
});
