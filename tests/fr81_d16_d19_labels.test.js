// #FR-81 D16: подписи периода органной дозы (D19 — строка EPA во вкладке бытовых рисков — снят в V08: строки EPA там больше нет, EPA — вкладка «Подробно», тест V13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './render_scenario.js';
const SRC = ['src/react/Result.jsx', 'default', (result, input) => ({ result, input, meta: null, initialTab: 'src' })]; // #FR-81 V13: таблица по нуклидам — на вкладке «Расчёт и источники»

// #FR-81 P2-9: проверяется показанный текст (серверный рендер компонентов), а не исходник .jsx
const ORGANS = ['src/react/Organs.jsx', 'default', (r, i) => ({ organs: r.organs, input: i })];
test('D16: основная таблица — «Орган с наибольшей дозой, за 1 год питания»; вкладка «Органы» называет срок', async () => {
  assert.match((await screen({ field: { years: '3' }, comp: SRC })).html, /Орган с наибольшей дозой, за 1 год питания/);
  assert.match((await screen({ field: { years: '3' }, comp: ORGANS })).html, /Срок питания — 3 года/);
});
