import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { listChoices } from '../src/calc/model.js';
import { productEntry } from '../src/calc/products.js';
import { processingOptions } from '../src/ui/form.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const choices = listChoices(data);
const ent = (n) => productEntry(data.products, n); // #FR-85: запись словаря вместо категории по основе
test('способы обработки: продукт не задан или не узнан — список пуст', () => {
  assert.equal(processingOptions(choices, 'Cs-137', ent('')).length, 0);
  assert.equal(processingOptions(choices, 'Cs-137', ent('космический борщ')).length, 0);
});
test('способы обработки: для черники только ягодные записи', () => {
  const o = processingOptions(choices, 'Cs-137', ent('черника лесная')); // #FR-85 v11: «черника» без уточнения — выбор
  assert.ok(o.length > 5 && o.length < 25, String(o.length));
  assert.ok(o.every(x => !/гриб|мясо|молоко|рыба/i.test(x.label)));
});
