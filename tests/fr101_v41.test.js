import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { REGIONS } from '../src/calc/region.js';
import { buildDoseSlices } from '../src/calc/dose_sources.js';
import { homeRadonDoseSv } from '../src/calc/summary_charts.js';
import { startAge } from '../src/calc/compare.js';
import { radonRisk, DEFAULT_COEFFS } from '../src/vendor/radon_risk/radonRisk.mjs';
import { buildBibliography } from '../src/ui/bibliography.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const scen = (region) => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1, region });
const calc = (region) => computeScenario(data, scen(region));
const tab = (region, t) => { const input = scen(region); return renderJsx('src/react/Result.jsx', 'default', { result: computeScenario(data, input), input, meta: META, initialTab: t }); };
const closeTo = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);

test('FR-101 v41: коэффициент равновесия радона переключается по региону', () => {
  const cmpW = calc('world').comparison;
  const cmpR = calc('ru').comparison;

  assert.equal(cmpW.parts.radonF, 0.4);
  assert.equal(cmpW.parts.radonFSrc.source, 'ICRP126');

  assert.equal(cmpR.parts.radonF, 0.5);
  assert.equal(cmpR.parts.radonFSrc.source, 'MR_2_6_1_0333_23');

  const C = 56.2;
  const H = cmpR.horizonYears;
  const ageStart = startAge(scen('ru'));

  const ruDose = homeRadonDoseSv(scen('ru'), cmpR, C);
  const expectedRu = radonRisk({ C, years: H, ageStart, smoking: 'never', F: 0.5 }).totalDose_mSv * 1e-3;
  assert.ok(closeTo(ruDose, expectedRu), `ruDose ${ruDose} should be close to ${expectedRu}`);

  const eroa = radonRisk({ C, years: 1, F: 0.5 }).input.F * C;
  assert.ok(Math.abs(eroa - 28.1) <= 0.05, `ЭРОА ${eroa} should be within 0.05 of 28.1`);

  const C2 = 40;
  const worldDose = homeRadonDoseSv(scen('world'), cmpW, C2);
  const ruDose2 = homeRadonDoseSv(scen('ru'), cmpR, C2);
  assert.ok(closeTo(ruDose2 / worldDose, 0.5 / 0.4, 1e-9), `Ratio ${ruDose2 / worldDose} should be close to ${0.5 / 0.4}`);

  const expectedWorld = radonRisk({ C: C2, years: H, ageStart, smoking: 'never' }).totalDose_mSv * 1e-3;
  assert.ok(closeTo(worldDose, expectedWorld), `worldDose ${worldDose} should be close to ${expectedWorld}`);
});

test('FR-101 v41: коэффициенты модуля радона не мутируются', () => {
  const before = JSON.stringify(DEFAULT_COEFFS);
  
  homeRadonDoseSv(scen('ru'), calc('ru').comparison, 50);
  homeRadonDoseSv(scen('world'), calc('world').comparison, 50);

  const after = JSON.stringify(DEFAULT_COEFFS);
  assert.equal(before, after);
  assert.ok(Object.isFrozen(DEFAULT_COEFFS));
  assert.equal(DEFAULT_COEFFS.exposure.default_equilibrium_factor_F.value, 0.4);
});

test('FR-101 v41: подпись F в подсказке радона и в «Подробном расчёте»', async () => {
  const worldCmp = await tab('world', 'cmp');
  const ruCmp = await tab('ru', 'cmp');
  
  assert.ok(norm(worldCmp).includes('F = 0,4 (МКРЗ 126)'), 'World cmp tab should contain F = 0,4 (МКРЗ 126)');
  assert.ok(norm(ruCmp).includes('F = 0,5 (МР 2.6.1.0333-23)'), 'Ru cmp tab should contain F = 0,5 (МР 2.6.1.0333-23)');

  const worldCalc = await tab('world', 'calc');
  const ruCalc = await tab('ru', 'calc');

  assert.ok(norm(worldCalc).includes('F = 0,4 (МКРЗ 126)'), 'World calc tab should contain F = 0,4 (МКРЗ 126)');
  assert.ok(norm(ruCalc).includes('F = 0,5 (МР 2.6.1.0333-23)'), 'Ru calc tab should contain F = 0,5 (МР 2.6.1.0333-23)');
  assert.ok(worldCalc.includes('id="refRadonF"'), 'World calc tab should contain id="refRadonF"');
});

test('FR-101 v41: техногенное облучение — сектор только в режиме «Россия», сумма секторов России = 4,18', async () => {
  const cmpR = calc('ru').comparison;
  const cmpW = calc('world').comparison;

  assert.equal(cmpR.parts.techno.msv, 0.01);
  assert.equal(cmpR.parts.techno.source, 'BARKOVSKY2021');

  const ds = buildDoseSlices(cmpR, null, {}).slices;
  const technoSlice = ds.find(s => s.id === 'techno');
  assert.ok(technoSlice, 'Techno slice should exist');
  assert.equal(technoSlice.label, 'Техногенное (глобальные выпадения, Чернобыль, предприятия)');
  
  const H = cmpR.horizonYears;
  assert.ok(closeTo(technoSlice.doseSv, 0.01e-3 * H), `Techno dose ${technoSlice.doseSv} should be close to ${0.01e-3 * H}`);
  assert.ok(technoSlice.hint.includes('по разности'), 'Techno hint should include "по разности"');

  const sumSlices = ds.filter(s => s.id !== 'product' && s.id !== 'flights');
  const sumDose = sumSlices.reduce((acc, s) => acc + s.doseSv, 0);
  const sumMsv = sumDose / (1e-3 * H);
  assert.ok(Math.abs(sumMsv - 4.18) <= 0.02, `Sum ${sumMsv} should be within 0.02 of 4.18`);

  assert.equal(cmpW.parts.techno, null);
  const dsW = buildDoseSlices(cmpW, null, {}).slices;
  assert.ok(!dsW.find(s => s.id === 'techno'), 'World should not have techno slice');

  const inputR = scen('ru');
  const resultR = computeScenario(data, inputR);
  const ruHtml = await renderJsx('src/react/SummaryTab.jsx', 'default', { result: resultR, input: inputR, radonC: NaN });
  
  const inputW = scen('world');
  const resultW = computeScenario(data, inputW);
  const worldHtml = await renderJsx('src/react/SummaryTab.jsx', 'default', { result: resultW, input: inputW, radonC: NaN });

  assert.ok(worldHtml.includes('id="sumTechnoNone"'), 'World summary should contain id="sumTechnoNone"');
  assert.ok(!ruHtml.includes('id="sumTechnoNone"'), 'Ru summary should not contain id="sumTechnoNone"');
  assert.ok(ruHtml.includes('Техногенное (глобальные выпадения, Чернобыль, предприятия)'), 'Ru summary should contain techno label');
});

test('FR-101 v41: список литературы режима «Россия» содержит МР и МУ по коэффициенту равновесия, режима «Мир» — МКРЗ 126', () => {
  const bibR = buildBibliography(calc('ru'));
  const idsR = bibR.map(b => b.id);
  assert.ok(idsR.includes('MR_2_6_1_0333_23'), 'Ru bibliography should include MR_2_6_1_0333_23');
  assert.ok(idsR.includes('MU_2_6_1_037_2015'), 'Ru bibliography should include MU_2_6_1_037_2015');

  const bibW = buildBibliography(calc('world'));
  const idsW = bibW.map(b => b.id);
  assert.ok(idsW.includes('ICRP126'), 'World bibliography should include ICRP126');
  assert.ok(!idsW.includes('MR_2_6_1_0333_23'), 'World bibliography should not include MR_2_6_1_0333_23');
});
