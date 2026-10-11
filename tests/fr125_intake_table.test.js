// #FR-125 (оператор 2026-10-11: «откуда эти числа?»): таблица «Поступление, риск и ПГП» — смысл столбцов и формулы; I₀ в «Подробном расчёте» помечено «без распада»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const input = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 3 });
const result = computeScenario(data, input);
const tab = async () => (await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'calc' })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('FR-125: заголовок столбца поступления называет 1-й год и распад; формула A · Fr · M · d₁ под таблицей', async () => {
  const t = await tab();
  assert.ok(t.includes('Поступление за 1-й год с учётом распада в течение года, Бк'));
  assert.ok(t.includes('поступление за 1-й год = A · Fr · M · d₁') && t.includes('столбец d'));
  for (const h of ['Риск за период потребления, R = r · E', 'Предел годового поступления (ПГП), Бк/год', 'Доля ПГП, %']) assert.ok(t.includes(h), h);
});

test('FR-125: в «Подробном расчёте» I₀ помечено «без распада в течение года»; числа не менялись (поступление 1-го года = первый элемент ряда)', async () => {
  const t = await tab();
  assert.ok(t.includes('I₀ = A · Fr · M — поступление за первый год (без распада в течение года), Бк'));
  assert.ok(result.rows[0].intakeBqPerYear > 0 && result.rows[0].yearly[0].intakeBq === result.rows[0].intakeBqPerYear);
});
