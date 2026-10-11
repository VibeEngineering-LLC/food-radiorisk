import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { radonLungSub, radonSubShares } from '../src/calc/cancer_sub.js';
import { riskSlices, linearAngles, fmtShare } from '../src/calc/summary_charts.js';

const input = inputFor('milk','молоко',[['Cs-137',100,10]],{portionKg:0.5,portionsPerYear:365,years:1});
const result = computeScenario(data, input);
const rs = riskSlices(result.lifeRisks);
const sub = radonLungSub(input, rs.H, 200, rs.b);
const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: 200 });
const fig = html.match(/data-chart="risk"[^]*?<\/figure>/)[0];
const inner = [...fig.matchAll(/<g data-inner="([^"]+)" data-a0="([-\d.]+)" data-a1="([-\d.]+)">([^]*?)<\/g>/g)].map(m => ({ id: m[1], a0: +m[2], a1: +m[3], body: m[4] }));
const angles = linearAngles(rs.slices.map(s => s.share));
let acc = -90; const sect = rs.slices.map((s, i) => { const o = { id: s.id, start: acc, end: acc + angles[i] }; acc += angles[i]; return o; });
const cancer = sect.find(s => s.id === 'cs_1026');

test('угол подсектора линейный: доля × 360°', () => {
  assert.equal(inner.filter(x => x.id.startsWith('radon_')).length, 1); // #FR-98: подсектора воздуха (air_*) — отдельно
  assert.equal(inner[0].id, 'radon_never');
  const expected = (sub.neverB / rs.total) * 360;
  const actual = inner[0].a1 - inner[0].a0;
  assert.ok(Math.abs(actual - expected) < 0.02, `Expected angle ~${expected}, got ${actual}`);
});

test('подсектор внутри сектора новообразований, у его начального края', () => {
  assert.ok(Math.abs(inner[0].a0 - cancer.start) < 0.02, `Expected a0 ~${cancer.start}, got ${inner[0].a0}`);
  assert.ok(inner[0].a1 <= cancer.end + 0.02, `Expected a1 <= ${cancer.end}, got ${inner[0].a1}`);
  assert.ok((inner[0].a1 - inner[0].a0) < (cancer.end - cancer.start), 'Subsector angle must be smaller than sector angle');
});

test('сумма углов круга = 360° без двойного счёта', () => {
  const sumAngles = angles.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumAngles - 360) < 1e-9, `Sum of angles should be 360, got ${sumAngles}`);
  const piePaths = fig.match(/<path class="pie-sl pie-s\d/g);
  assert.equal(piePaths.length, rs.slices.length, `Number of pie slices should match rs.slices.length`);
  const sumShares = rs.slices.reduce((a, s) => a + s.share, 0);
  assert.ok(Math.abs(sumShares - 1) < 1e-9, `Sum of shares should be 1, got ${sumShares}`);
});

test('подсказка и клавиатура подсектора', () => {
  assert.ok(inner[0].body.includes('tabindex="0"'), 'Should contain tabindex="0"');
  const shareStr = fmtShare(sub.neverB / rs.total).replace(/ /g, ' '); // #FR-124: экран в тесте нормализован
  assert.ok(inner[0].body.includes(`<title>`), 'Should contain <title>');
  assert.ok(inner[0].body.includes(shareStr), `Should contain share string: ${shareStr}`);
  assert.ok(inner[0].body.includes('радон'), 'Should contain word "радон"');
});

test('легенда: одна подстрока «в т. ч.» с образцом', () => {
  const matches = fig.match(/data-sub="radon_never"/g);
  assert.equal(matches.length, 1, 'Should have exactly one data-sub="radon_never"');
  const idx = fig.indexOf('data-sub="radon_never"');
  const endIdx = fig.indexOf('</tr>', idx);
  const row = fig.substring(idx, endIdx);
  assert.ok(row.includes('pie-sub-solid'), 'Legend row should contain pie-sub-solid');
  assert.ok(!fig.includes('radon_smoker_add'), 'Should not contain radon_smoker_add');
});

test('громкая проверка', () => {
  const bad1 = radonSubShares({neverB: 0.5}, 0.014, 1);
  assert.equal(bad1.bad, true);
  const bad2 = radonSubShares({neverB: 0.001}, 0.014, 1);
  assert.equal(bad2.bad, false);
  const lung = result.lifeRisks.lifetime.refs.find(r => r.code === '1034').p;
  const bad3 = radonSubShares(sub, lung, rs.total);
  assert.equal(bad3.bad, false);
});

test('штриховки в CSS нет', () => {
  const css = readFileSync('src/ui/charts.css', 'utf-8');
  assert.ok(!css.includes('pie-hatch'), 'CSS should not contain pie-hatch');
  assert.ok(!css.includes('pie-sub-hatch'), 'CSS should not contain pie-sub-hatch');
  assert.ok(css.includes('pie-sub-solid'), 'CSS should contain pie-sub-solid');
  const mediaIdx = css.indexOf('@media print');
  assert.ok(mediaIdx !== -1, 'CSS should contain @media print');
  const afterMedia = css.substring(mediaIdx);
  assert.ok(afterMedia.includes('print-color-adjust'), 'After @media print should contain print-color-adjust');
});
