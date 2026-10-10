// #FR-88 v18/v21, пункт 4: в справке (sources.html) есть раздел «Известные ограничения» — 8 пунктов, текст утверждён оператором (v21)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../sources.html', import.meta.url), 'utf8');
test('раздел «Известные ограничения» есть, пунктов 8, заглушек и черновика нет', () => {
  assert.match(html, /<h2 id="limits">Известные ограничения<\/h2>/);
  const list = html.match(/<ul id="limits-list">([\s\S]*?)<\/ul>/)[1];
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items.length, 8);
  for (const k of ['Объём проверки', 'Распознавание названий', 'Блюда', 'Консервированная кукуруза', 'Масло какао', 'Коэффициенты перехода при обработке', 'Нормы ЕС', 'Данные о переходе в продукты']) {
    assert.ok(items.some((t) => t.startsWith('<strong>' + k)), k);
  }
  const section = html.slice(html.indexOf('<h2 id="limits">'), html.indexOf('</ul>', html.indexOf('id="limits-list"')));
  assert.ok(!section.includes('[текст'), 'заглушек «[текст]» нет');
  assert.ok(!section.includes('Черновик'), 'слова «Черновик» нет');
});
