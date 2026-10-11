// #FR-116 (оператор 2026-10-11: «в предыдущих версиях была шкала рисков. верни»): шкала рисков и подсветка блока «Риск от этого питания» во вкладке «Сводка»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { riskAssessmentOf, logPos } from '../src/calc/risk_zone.js';
import { renderJsx } from './render_helper.js';

const input = inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 1, product: { name: 'грибы сушёные', state: 'dried' }, dryingFactor: 10 });
const base = computeScenario(data, input);
// риск подменяется на заданный (на 1 млн); остальное — реальный расчёт
const screen = async (perMln) => {
  const risk = perMln * 1e-6;
  const result = { ...base, eating: null, totals: { ...base.totals, riskNominal: risk, riskAssessment: riskAssessmentOf(data.risk, risk) } };
  const html = await renderJsx('src/react/Summary.jsx', 'RiskSummary', { result, input });
  return { html, pos: Number(html.match(/class="dot"[^>]*data-pos="([\d.]+)"/)?.[1]), box: html.match(/class="riskbox rs risk (risk-\w+)"/)?.[1], left: html.match(/class="dot" style="left:([^"]*)"/)?.[1] };
};

test('FR-116: 0,5 / 3 / 80 на млн — зелёный / янтарный / красный блок, маркер в своей зоне шкалы', async () => {
  const g = await screen(0.5), y = await screen(3), r = await screen(80);
  assert.deepEqual([g.box, y.box, r.box], ['risk-negligible', 'risk-within', 'risk-exceeds']);
  assert.ok(g.pos > 0 && g.pos < 40, `зелёная зона: ${g.pos}`);
  assert.ok(y.pos > 40 && y.pos < 74, `янтарная зона: ${y.pos}`);
  assert.ok(r.pos > 74 && r.pos < 100, `красная зона: ${r.pos}`);
});

test('FR-116: подписи отметок шкалы и уровни НРБ взяты из данных', async () => {
  const { html } = await screen(3);
  for (const s of ['0,01 на 1 000 000', '1 000 на 1 000 000', 'class="riskscale"', 'class="scalelbl"']) assert.ok(html.includes(s), s);
  const ra = riskAssessmentOf(data.risk, 3e-6);
  assert.deepEqual([ra.negligible.value, ra.limit.value], [1e-6, 5e-5]);
  assert.ok(Math.abs(logPos(1e-6) - 40) < 1e-9 && Math.abs(logPos(5e-5) - 73.979) < 1e-3);
});

test('FR-116: маркер не выходит за края: риск меньше 0,01 и больше 1000 на млн прижат к краю', async () => {
  const lo = await screen(0.001), hi = await screen(5000);
  assert.equal(lo.pos, 0);
  assert.equal(hi.pos, 100);
  assert.match(lo.left, /^clamp\(11px, 0%, calc\(100% - 11px\)\)$/);
  assert.match(hi.left, /^clamp\(11px, 100%, calc\(100% - 11px\)\)$/);
});
