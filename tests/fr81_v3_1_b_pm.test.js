// #FR-81 V3-1: «± 0» в показателе B не пишется — нет неопределённости → «B = 3,92»; есть → «B = 2 ± 0,2»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtBpm, fmtBLine } from '../src/ui/fmt.js';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { buildReport } from '../src/ui/report.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const mk = (da) => inputFor('mushrooms_fresh', 'грибы свежие', [['Cs-137', 400, da]], { portionKg: 0.3, portionsPerYear: 60, years: 1 });
const draw = async (input) => { const result = computeScenario(data, input); const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META }); return { text: norm(html), result, input }; };
const REP = (fmt, input, result) => buildReport(fmt, { input, result }, META, '2026-10-06T00:00:00.000Z').text;

test('V3-1: помощники — ΔB = 0 без «±»', () => {
  assert.equal(fmtBpm(3.92, 0), '3,92');
  assert.equal(fmtBpm(2, 0.2), '2 ± 0,2');
  assert.equal(fmtBLine(3.92, 0), 'B = 3,92');
  assert.equal(fmtBLine(2, 0.2), 'B = 2, ΔB = 0,2');
});

test('V3-1: экран и отчёт md/html без «± 0», когда неопределённости нет', async () => {
  const { text, result, input } = await draw(mk(0));
  assert.equal(result.limits.compliance.dB, 0);
  assert.match(text, /Показатель B = [\d,]+\. Норматив/);
  assert.ok(!/ ± 0(?![\d,])/.test(text) && !text.includes('ΔB = 0'));
  for (const fmt of ['md', 'html']) {
    const r = REP(fmt, input, result);
    assert.match(r, /B = [\d,]+, /);
    assert.ok(!/ ± 0(?![\d,])/.test(r) && !r.includes('ΔB = 0'), fmt);
  }
});

test('V3-1: неопределённость задана — «±» и ΔB остаются', async () => {
  const { text, result, input } = await draw(mk(40));
  assert.ok(result.limits.compliance.dB > 0);
  assert.match(text, /Показатель B = [\d,]+ ± [\d,]+\./);
  assert.match(text, /ΔB = [\d,]+/);
  assert.match(REP('md', input, result), /B = [\d,]+, ΔB = [\d,]+/);
});
