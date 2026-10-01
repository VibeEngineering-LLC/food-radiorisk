// #FR-22: у каждого названия продукта без кириллицы в данных обработки есть русский перевод
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import FOOD_RU from '../src/ui/food_ru.json' with { type: 'json' };
const P = JSON.parse(await readFile(new URL('../public/data/processing.json', import.meta.url), 'utf8')).records;

test('все английские названия продуктов обработки переведены', () => {
  const missing = [...new Set(P.map(r => r.food).filter(f => f && !/[а-яё]/i.test(f) && !FOOD_RU[f]))];
  assert.deepEqual(missing, []);
});
