import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { listChoices } from '../src/calc/model.js';
import { categoryOf } from '../src/calc/catalog.js';
import { processingOptions } from '../src/ui/form.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const choices = listChoices(data);
test('способы обработки: продукт не задан или не узнан — список пуст', () => {
  assert.equal(processingOptions(choices, 'Cs-137', categoryOf('')).length, 0);
  assert.equal(processingOptions(choices, 'Cs-137', categoryOf('космический борщ')).length, 0);
});
test('способы обработки: для черники только ягодные записи', () => {
  const o = processingOptions(choices, 'Cs-137', categoryOf('черника'));
  assert.ok(o.length > 5 && o.length < 25, String(o.length));
  assert.ok(o.every(x => !/гриб|мясо|молоко|рыба/i.test(x.label)));
});
