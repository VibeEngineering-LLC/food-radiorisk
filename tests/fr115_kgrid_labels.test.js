// #FR-115 (оператор 2026-10-11: «надписи слева от блоков дублируют блоки»): в сетке итогов нет колонки подписей слева, название строки — внутри карточки, один раз
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const input = inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const result = computeScenario(data, input);
const html = await renderJsx('src/react/Result.jsx', 'KpiGrid', { totals: result.totals, input });
const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const count = (s, sub) => s.split(sub).length - 1;

test('FR-115: в сетке итогов нет колонки подписей .kr и inline-колонки max-content', () => {
  assert.ok(!/class="kr"/.test(html));
  assert.ok(!/max-content/.test(html));
  assert.match(html, /^<div class="kgrid">/);
});

test('FR-115: название каждой строки встречается один раз и стоит внутри карточки дозы', () => {
  for (const row of ['1-й год потребления', 'Ē₅ за 5 лет подряд', 'Весь срок потребления']) {
    assert.equal(count(text, row), 1, row);
    assert.match(html, new RegExp(`<div class="kpi[^"]*"><div class="krow">${row}`));
  }
  assert.equal(count(text, 'Ожидаемая эффективная доза'), 1);
  assert.equal(count(text, 'Доля нормы НРБ -99/2009'), 1); // #FR-124: НРБ — <abbr title>, при снятии тегов остаётся пробел
});
