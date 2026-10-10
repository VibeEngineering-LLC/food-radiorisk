// #FR-81: общие помощники тестов — данные из public/data и сценарий с группой норм РФ
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
export const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
/** @param {string} group @param {string} name @param {Array<[string, number]>} nuc @param {object} [over] */
export function run(group, name, nuc, over = {}) { return runWith(data, group, name, nuc, over); }
/** то же с подменой набора данных (проверка, что пороги берутся из данных) */
export function runWith(dataX, group, name, nuc, over = {}) { return computeScenario(dataX, inputFor(group, name, nuc, over)); }
/** вход расчёта (как в runWith) — для рендера экрана с тем же входом */
export function inputFor(group, name, nuc, over = {}) {
  return { age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.05, portionKg: 0.1, portionsPerYear: 10, years: 1, eatDate: null,
    dryMatterPercent: null, product: { name, state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: group,
    nuclides: nuc.map(([nuclide, a, da = 0]) => ({ nuclide, source: 'measured', measuredBqPerKg: a, measuredUncertaintyBqPerKg: da, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } })),
    ...over };
}
