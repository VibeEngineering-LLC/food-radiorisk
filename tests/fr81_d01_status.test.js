// #FR-81 D01: статус зарубежной нормы определяется по НАЧАЛУ строки; слово «истёк» внутри действующего статуса норму не скрывает
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const run = (group) => computeScenario(data, { age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 10, years: 1, eatDate: null,
  dryMatterPercent: null, product: { name: 'молоко', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: group,
  nuclides: [{ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 100, measuredUncertaintyBqPerKg: 0, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } }] });

test('D01: действующая норма ЕС 370 Бк/кг (статус содержит «истёк» внутри) показана для молока', () => {
  const f = run('milk').limits.foreign.find(x => x.id === 'eu_2020_1158_cs137_milk_infant');
  assert.ok(f, 'норма eu_2020_1158 не показана');
  assert.equal(f.value, 370);
  assert.equal(f.force.rank, 0);
});
test('D01: нормы, статус которых НАЧИНАЕТСЯ с «заменён», по-прежнему скрыты', () => {
  const ids = run('milk').limits.foreign.map(x => x.id);
  assert.ok(!ids.includes('eu_733_2008_cs134_137_milk_infant'));
});
