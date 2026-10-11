// #FR-88 v18/v21, пункт 4: на вкладке «Источники» (с #FR-121; прежде — страница sources.html) есть раздел «Известные ограничения» — 8 пунктов, текст утверждён оператором (v21)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
const input = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], {});
const full = await renderJsx('src/react/Result.jsx', 'default', { result: computeScenario(data, input), input, meta: { datasets: 1, records: 1, sha: 'abcdefgh' }, initialTab: 'src' });
const html = full.slice(full.indexOf('<h2 id="limits"'));
test('раздел «Известные ограничения» есть, пунктов 8, заглушек и черновика нет', () => {
  assert.match(html, /^<h2 id="limits"[^>]*>Известные ограничения<\/h2>/);
  const list = html.match(/<ul id="limits-list">([\s\S]*?)<\/ul>/)[1];
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items.length, 8);
  for (const k of ['Объём проверки', 'Распознавание названий', 'Блюда', 'Консервированная кукуруза', 'Масло какао', 'Коэффициенты перехода при обработке', 'Нормы ЕС', 'Данные о переходе в продукты']) {
    assert.ok(items.some((t) => t.startsWith('<strong>' + k)), k);
  }
  const section = html.slice(0, html.indexOf('</ul>'));
  assert.ok(!section.includes('[текст'), 'заглушек «[текст]» нет');
  assert.ok(!section.includes('Черновик'), 'слова «Черновик» нет');
});
