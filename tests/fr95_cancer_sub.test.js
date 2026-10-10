import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { radonRisk } from '../src/vendor/radon_risk/radonRisk.mjs';
import { radonLungSub } from '../src/calc/cancer_sub.js';
import { startAge } from '../src/calc/compare.js';
import { riskSlices } from '../src/calc/summary_charts.js';
import { fmtPerMillion } from '../src/ui/fmt.js';

const input = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const result = computeScenario(data, input);
const H = result.lifeRisks.lifetime.H;

const norm = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const mod = (C, s) => radonRisk({ C, years: H, ageStart: startAge(input), smoking: s }).darby.excess;

const life = (C) => renderJsx('src/react/LifeRisks.jsx', 'default', { life: result.lifeRisks, input, radonC: C, radonIsDefault: C === 200 }); // #FR-101: признак «по умолчанию» передаёт родитель (действующие значения — effectiveInputs)
const sum = (C) => renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: C });

test('radonLungSub values and edge cases', async () => {
  const sub = radonLungSub(input, H, 200);
  assert.equal(sub.never, mod(200, 'never'));
  assert.equal(sub.smoker, mod(200, 'smoker'));
  assert.ok(sub.smoker > sub.never);

  assert.equal(radonLungSub(input, H, 0), null);
  assert.equal(radonLungSub(input, H, NaN), null);
  assert.equal(radonLungSub(input, 0, 200), null);
});

test('LifeRisks tab renders radon sub-row with correct values and labels', async () => {
  const html200 = (await life(200));
  const match200 = html200.match(/<tr[^>]*data-sub="radon"[^>]*>[^]*?<\/tr>/);
  assert.ok(match200, 'radon sub-row not found for C=200');
  const subHtml200 = match200[0];

  const bB = result.lifeRisks.lifetime.b; // #FR-99: значение строки — радон некурящего на горизонт таблицы (до b лет), не «к 75»
  assert.ok(subHtml200.includes(fmtPerMillion(radonLungSub(input, H, 200, bB).neverB)), 'missing never value for C=200');
  assert.ok(!/(^|[^а-яё])курящ/i.test(subHtml200), 'курящий — не в строке таблицы (текстом под таблицей)');
  assert.ok(norm(html200).includes('по умолчанию'), 'missing "по умолчанию" text');
  assert.ok(norm(html200).includes('200'), 'missing "200" text');

  const html400 = (await life(400));
  const match400 = html400.match(/<tr[^>]*data-sub="radon"[^>]*>[^]*?<\/tr>/);
  assert.ok(match400, 'radon sub-row not found for C=400');
  const subHtml400 = match400[0];

  assert.ok(subHtml400.includes(fmtPerMillion(radonLungSub(input, H, 400, bB).neverB)), 'missing never value for C=400');
  assert.ok(norm(html400).includes('по вашему вводу'), 'missing "по вашему вводу" text');
  assert.notEqual(subHtml400, subHtml200, 'sub-row HTML should differ between C=200 and C=400');
});

test('radon sub-row is immediately after "Новообразования" row', async () => {
  const html = (await life(200));
  const idxNovo = html.indexOf('Злокачественные и другие новообразования (рак)');
  assert.ok(idxNovo !== -1, 'строка новообразований не найдена');
  const idxRadon = html.indexOf('data-sub="radon"');
  assert.ok(idxRadon !== -1, 'data-sub="radon" not found');
  assert.ok(idxRadon > idxNovo, 'radon sub-row should be after "Новообразования"');

  const afterNovo = html.slice(idxNovo);
  const nextTrIdx = afterNovo.indexOf('<tr');
  assert.ok(nextTrIdx !== -1, 'no <tr found after "Новообразования"');
  const nextTrTag = afterNovo.slice(nextTrIdx, afterNovo.indexOf('>', nextTrIdx) + 1);
  assert.ok(nextTrTag.includes('data-sub="radon"'), 'first <tr after "Новообразования" should be the radon sub-row');
});

test('Summary chart (b) does not include radon sub-row in pie slices', async () => {
  const html = (await sum(200));
  const figMatch = html.match(/<figure[^>]*data-chart="risk"[^]*?<\/figure>/);
  assert.ok(figMatch, 'figure with data-chart="risk" not found');
  const figHtml = figMatch[0];

  const slices = riskSlices(result.lifeRisks).slices;
  const piePathCount = (figHtml.match(/<path class="pie-sl pie-s\d/g) || []).length; // #FR-97: подсектора (pie-sub) — не сектора круга
  assert.equal(piePathCount, slices.length, 'pie slice count should match riskSlices length');

  const legendRadonCount = (figHtml.match(/<tr class="pie-sub" data-sub="radon_/g) || []).length;
  assert.equal(legendRadonCount, 1, '#FR-99: одна подстрока «в т. ч.» в легенде (радон, некурящий); курящий — текстом');

  const totalShare = slices.reduce((acc, s) => acc + s.share, 0);
  assert.ok(Math.abs(totalShare - 1) < 1e-9, 'sum of shares should be 1');

  const totalP = slices.reduce((acc, s) => acc + s.p, 0);
  assert.ok(Math.abs(riskSlices(result.lifeRisks).total - totalP) < 1e-12, 'total should equal sum of slices.p');
});

test('Text mentions non-additivity and excludes smoking sub-row', async () => {
  const lifeText = norm((await life(200)));
  const sumText = norm((await sum(200)));

  assert.ok(lifeText.includes('не складываются'), 'LifeRisks text missing "не складываются"');
  assert.ok(lifeText.includes('входит в «Новообразования»'), 'LifeRisks text missing "входит в «Новообразования»"');
  assert.ok(sumText.includes('не складываются'), 'Summary text missing "не складываются"');
  assert.ok(sumText.includes('входит в «Новообразования»'), 'Summary text missing "входит в «Новообразования»"');

  const lifeHtml = (await life(200));
  const sumHtml = (await sum(200));
  assert.ok(!/data-sub="smok/.test(lifeHtml), 'data-sub="smok" should not be present in LifeRisks');
  assert.ok(!/data-sub="smok/.test(sumHtml), 'data-sub="smok" should not be present in Summary');

  const lifeSubCount = (lifeHtml.match(/data-sub="radon/g) || []).length; // #FR-98: подстроки воздуха (air_*) считаются отдельно
  assert.equal(lifeSubCount, 1, 'exactly one data-sub in LifeRisks tab');
});

test('Model attribution mentions Darby and different model', async () => {
  const lifeText = norm((await life(200)));
  const sumText = norm((await sum(200)));

  assert.ok(lifeText.includes('Darby'), 'LifeRisks text missing "Darby"');
  assert.ok(lifeText.includes('другая модель'), 'LifeRisks text missing "другая модель"');
  assert.ok(sumText.includes('Darby'), 'Summary text missing "Darby"');
  assert.ok(sumText.includes('другая модель'), 'Summary text missing "другая модель"');
});
