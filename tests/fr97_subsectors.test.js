import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { radonRisk } from '../src/vendor/radon_risk/radonRisk.mjs';
import { radonLungSub, radonSubShares } from '../src/calc/cancer_sub.js';
import { startAge } from '../src/calc/compare.js';
import { riskSlices, linearAngles, fmtShare } from '../src/calc/summary_charts.js';

const input = inputFor('milk','молоко',[['Cs-137',100,10]],{portionKg:0.5,portionsPerYear:365,years:1});
const result = computeScenario(data, input);
const rs = riskSlices(result.lifeRisks);
const H = result.lifeRisks.lifetime.H;
const mod = (C, s) => radonRisk({ C, years: H, ageStart: startAge(input), smoking: s }).darby.excess;
const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: 200 });
const fig = html.match(/data-chart="risk"[^]*?<\/figure>/)[0];
const inner = [...fig.matchAll(/<g data-inner="([^"]+)" data-a0="([-\d.]+)" data-a1="([-\d.]+)">([^]*?)<\/g>/g)].map(m => ({ id: m[1], a0: +m[2], a1: +m[3], body: m[4] }));
const angles = linearAngles(rs.slices.map(s => s.share));
let acc = -90; const sect = rs.slices.map((s, i) => { const o = { id: s.id, start: acc, end: acc + angles[i] }; acc += angles[i]; return o; });
const cancer = sect.find(s => s.id === 'cs_1026');
const never = mod(200, 'never'), add = mod(200, 'smoker') - mod(200, 'never');

test('подсектора линейны: угол = доля × 360°', () => {
  assert.equal(inner.length, 2);
  const ids = inner.map(x => x.id);
  assert.ok(ids.includes('radon_never'));
  assert.ok(ids.includes('radon_smoker_add'));

  const neverSub = inner.find(x => x.id === 'radon_never');
  const smokerSub = inner.find(x => x.id === 'radon_smoker_add');

  const expectedNeverAngle = (never / rs.total) * 360;
  const actualNeverAngle = neverSub.a1 - neverSub.a0;
  assert.ok(Math.abs(actualNeverAngle - expectedNeverAngle) < 0.02, `Never angle mismatch: ${actualNeverAngle} vs ${expectedNeverAngle}`);

  const expectedAddAngle = (add / rs.total) * 360;
  const actualAddAngle = smokerSub.a1 - smokerSub.a0;
  assert.ok(Math.abs(actualAddAngle - expectedAddAngle) < 0.02, `Add angle mismatch: ${actualAddAngle} vs ${expectedAddAngle}`);
});

test('подсектора лежат внутри сектора новообразований и начинаются у его края', () => {
  assert.ok(Math.abs(inner[0].a0 - cancer.start) < 0.02, `inner[0].a0 ${inner[0].a0} should be near cancer.start ${cancer.start}`);
  assert.ok(Math.abs(inner[1].a0 - inner[0].a1) < 0.02, `inner[1].a0 ${inner[1].a0} should be near inner[0].a1 ${inner[0].a1}`);
  assert.ok(inner[1].a1 <= cancer.end + 0.02, `inner[1].a1 ${inner[1].a1} should be <= cancer.end ${cancer.end}`);
  
  const totalSubAngle = (inner[0].a1 - inner[0].a0) + (inner[1].a1 - inner[1].a0);
  const cancerAngle = cancer.end - cancer.start;
  assert.ok(totalSubAngle < cancerAngle, `Total sub angle ${totalSubAngle} should be < cancer angle ${cancerAngle}`);
});

test('сумма углов круга = 360° без двойного счёта', () => {
  const sumAngles = angles.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumAngles - 360) < 1e-9, `Sum of angles ${sumAngles} should be 360`);

  const piePaths = fig.match(/<path class="pie-sl pie-s\d+/g);
  assert.equal(piePaths.length, rs.slices.length, `Number of pie paths ${piePaths.length} should equal rs.slices.length ${rs.slices.length}`);

  const sumShares = rs.slices.reduce((a, s) => a + s.share, 0);
  assert.ok(Math.abs(sumShares - 1) < 1e-9, `Sum of shares ${sumShares} should be 1`);

  const subTotalAngle = inner[1].a1 - inner[0].a0;
  const cancerAngle = cancer.end - cancer.start;
  assert.ok(subTotalAngle < cancerAngle, `Sub total angle ${subTotalAngle} should be < cancer angle ${cancerAngle}`);
});

test('штрихованный подсектор использует pattern', () => {
  assert.ok(fig.includes('<pattern id="risk-hatch"'), 'Should contain pattern id="risk-hatch"');
  
  const smokerSub = inner.find(x => x.id === 'radon_smoker_add');
  assert.ok(smokerSub.body.includes('fill="url(#risk-hatch)"'), 'Smoker sub should have fill="url(#risk-hatch)"');
  assert.ok(smokerSub.body.includes('pie-sub-hatch'), 'Smoker sub should have class pie-sub-hatch');

  const neverSub = inner.find(x => x.id === 'radon_never');
  assert.ok(!neverSub.body.includes('url(#'), 'Never sub should not have url(#)');
  assert.ok(neverSub.body.includes('pie-sub-solid'), 'Never sub should have class pie-sub-solid');
});

test('подсказки и клавиатура у подсекторов', () => {
  const neverSub = inner.find(x => x.id === 'radon_never');
  const smokerSub = inner.find(x => x.id === 'radon_smoker_add');

  assert.ok(neverSub.body.includes('tabindex="0"'), 'Never sub should have tabindex="0"');
  assert.ok(neverSub.body.includes('<title>'), 'Never sub should have <title>');
  assert.ok(neverSub.body.includes('радон'), 'Never sub title should contain "радон"');

  assert.ok(smokerSub.body.includes('tabindex="0"'), 'Smoker sub should have tabindex="0"');
  assert.ok(smokerSub.body.includes('<title>'), 'Smoker sub should have <title>');
  assert.ok(smokerSub.body.includes('курящего'), 'Smoker sub title should contain "курящего"');
});

test('легенда: две подстроки с образцами', () => {
  assert.ok(fig.includes('data-sub="radon_never"'), 'Should contain data-sub="radon_never"');
  assert.ok(fig.includes('data-sub="radon_smoker_add"'), 'Should contain data-sub="radon_smoker_add"');

  const neverLine = fig.match(/data-sub="radon_never"[^]*?<\/tr>/);
  const smokerLine = fig.match(/data-sub="radon_smoker_add"[^]*?<\/tr>/);
  
  assert.ok(neverLine, 'Should find never legend line');
  assert.ok(smokerLine, 'Should find smoker legend line');
  
  assert.ok(neverLine[0].includes('pie-sub-solid'), 'Never legend should have pie-sub-solid');
  assert.ok(smokerLine[0].includes('pie-sub-hatch'), 'Smoker legend should have pie-sub-hatch');

  assert.ok(html.includes('сплошной + штрихованный'), 'HTML should contain "сплошной + штрихованный"');
  assert.ok(html.includes('к сумме не прибавляются'), 'HTML should contain "к сумме не прибавляются"');
});

test('громкая проверка несогласованных величин', () => {
  const bad1 = radonSubShares({never:0.01, smoker:0.005}, 0.1, 1);
  assert.equal(bad1.bad, true, 'bad1 should be true');

  const bad2 = radonSubShares({never:0.01, smoker:0.2}, 0.1, 1);
  assert.equal(bad2.bad, true, 'bad2 should be true');

  const good = radonSubShares({never:0.001, smoker:0.003}, 0.1, 1);
  assert.equal(good.bad, false, 'good should be false');

  const cancerSlice = rs.slices.find(s => s.id === 'cs_1026');
  const realSub = radonSubShares(radonLungSub(input, H, 200), cancerSlice.p, rs.total);
  assert.equal(realSub.bad, false, 'realSub.bad should be false');
  assert.ok(realSub.never > 0, 'realSub.never should be > 0');
  assert.ok(realSub.add > 0, 'realSub.add should be > 0');
});

test('штриховка видна в тёмной теме и при печати', () => {
  const css = readFileSync('src/ui/charts.css', 'utf-8');
  assert.ok(css.includes('.pie-hatch-line'), 'CSS should contain .pie-hatch-line');
  assert.ok(css.includes('.pie-sub-hatch'), 'CSS should contain .pie-sub-hatch');
  
  const printIdx = css.indexOf('@media print');
  assert.ok(printIdx !== -1, 'CSS should contain @media print');
  const afterPrint = css.slice(printIdx);
  assert.ok(afterPrint.includes('print-color-adjust'), 'After @media print should contain print-color-adjust');
});
