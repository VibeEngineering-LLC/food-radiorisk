// #FR-119 (оператор 2026-10-11: «поступление раскрой»): сворачиваемые блоки с основными числами открыты по умолчанию
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const screen = async (input, initialTab) => renderJsx('src/react/Result.jsx', 'default', { result: computeScenario(data, input), input, meta: META, initialTab });
const base = (over = {}) => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 3, ...over });

test('FR-119: «Поступление, риск и предел годового поступления (ПГП) по радионуклидам» раскрыт по умолчанию (атрибут open), пользователь может свернуть', async () => {
  const html = await screen(base(), 'calc');
  assert.match(html, /<details class="more" open=""><summary>Поступление, риск и предел годового поступления \(ПГП\) по радионуклидам<\/summary>/);
});

test('FR-119: «Доза по возрастным группам» тоже раскрыт по умолчанию', async () => {
  const html = await screen(base({ lifetime: { fromAge: 3, toAge: 13 }, age: '5y' }), 'calc');
  assert.match(html, /<details class="more" open=""><summary>Доза по возрастным группам/);
});

test('FR-119: таблицы «Расчёт по радионуклидам» и «Поступление…» лежат в обёртке .tablewrap (прокрутка внутри обёртки, без обрезки)', async () => {
  const html = await screen(base(), 'calc');
  const i = html.indexOf('Расчёт по радионуклидам');
  assert.ok(i > 0);
  assert.match(html.slice(i, i + 400), /<div class="tablewrap"><table>/);
  const j = html.indexOf('Поступление, риск и предел годового поступления (ПГП) по радионуклидам');
  assert.match(html.slice(j, j + 300), /<div class="tablewrap"><table>/);
});
