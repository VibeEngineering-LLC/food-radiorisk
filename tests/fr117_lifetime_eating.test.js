// #FR-117 (оператор 2026-10-11: «и тут нужен пожизненный риск» → «два числа») и #FR-118 (порядок вкладок): второе число — риск при питании всю жизнь
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { startAge, horizonYears } from '../src/calc/compare.js';
import { riskAssessmentOf } from '../src/calc/risk_zone.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const mk = (over = {}, a = 100) => inputFor('milk', 'молоко', [['Cs-137', a, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 3, ...over });
const flat = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[\s  ]+/g, ' ');
const summary = (result, input) => renderJsx('src/react/Summary.jsx', 'RiskSummary', { result, input });

test('FR-117: число (2) равно computeScenario в режиме lifetime с теми же входами, (2) ≥ (1), цвет блока — по (2), маркер (1) второй', async () => {
  for (const region of ['world', 'ru']) for (const age of ['adult', '5y']) {
    const input = mk({ region, age }), result = computeScenario(data, input);
    const a = startAge(input), H = horizonYears(input);
    const ref = computeScenario(data, { ...input, lifetime: { fromAge: a, toAge: a + H }, years: H });
    assert.ok(ref.ok && result.eating.ok, `${region}/${age}`);
    assert.equal(result.eating.riskNominal, ref.totals.riskNominal);
    assert.ok(result.eating.riskNominal >= result.totals.riskNominal);
    const html = await summary(result, input);
    const level = riskAssessmentOf(data.risk, ref.totals.riskNominal).level;
    assert.match(html, new RegExp(`class="riskbox rs risk risk-${level}"`));
    assert.ok(html.includes('dot dot2') && html.includes('rs-number-life'));
    const t = flat(html);
    assert.ok(t.includes('При потреблении в течение 3 лет') && t.includes('При таком же потреблении в течение'));
    assert.ok(t.includes('— при таком же потреблении в течение'));
  }
});

test('FR-117: бывает, что цвет по (2) отличается от цвета по (1) — блок красится по (2)', async () => {
  let found = null;
  for (const a of [1, 2, 5, 10, 20, 50]) {
    const input = mk({ years: 1 }, a), result = computeScenario(data, input);
    if (result.totals.riskAssessment.level !== result.eating.riskAssessment.level) { found = { input, result }; break; }
  }
  assert.ok(found, 'нашёлся сценарий с разными зонами');
  const html = await summary(found.result, found.input);
  assert.match(html, new RegExp(`class="riskbox rs risk risk-${found.result.eating.riskAssessment.level}"`));
});

test('FR-117: источник коэффициентов НРБ-99/2009 — «недоступно для выбранного источника коэффициентов» с причиной, цвет — по (1)', async () => {
  const input = mk({ doseSource: 'NRB2009_App2' }), result = computeScenario(data, input);
  assert.equal(result.eating.ok, false);
  const html = await summary(result, input), t = flat(html);
  assert.ok(t.includes('недоступно для выбранного источника коэффициентов'));
  assert.ok(t.includes('только для критической группы'));
  assert.match(html, new RegExp(`class="riskbox rs risk risk-${result.totals.riskAssessment.level}"`));
});

test('FR-117: строка с формулой в «Пожизненном расчёте» «Подробного расчёта» и в отчёте md', async () => {
  const input = mk(), result = computeScenario(data, input);
  const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'calc' });
  assert.ok(html.includes('data-lt="eating:life"'));
  assert.ok(flat(html).includes('в режиме «с возраста 18 до 68 лет»'));
  const { buildReport } = await import('../src/ui/report.js');
  const md = buildReport('md', { input, result }, META, '2026-10-11T00:00:00Z').text;
  assert.ok(md.includes('При таком же потреблении в течение'));
});

test('FR-118: порядок вкладок — Сводка, Сравнение с облучением, Бытовые риски, Соответствие нормам, Подробный расчёт, Место сбора и величины, Для специалиста, Источники', async () => {
  const input = mk(), result = computeScenario(data, input);
  const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: '' });
  const labels = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)].map(m => m[1]);
  assert.equal(labels.length, 8);
  assert.equal(labels[0], 'Сводка');
  assert.equal(labels[1], 'Сравнение доз');
  assert.ok(labels[2].startsWith('Бытовые риски за'));
  assert.deepEqual(labels.slice(3), ['Соответствие нормам', 'Подробный расчёт', 'Место сбора и величины', 'Для специалиста', 'Источники']);
});
