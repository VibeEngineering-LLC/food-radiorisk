// #FR-81 P2-3 (fix-review-1 №1): «сырой/сырая/сырое» — не «сыр»: сырое молоко — молоко (п. 5), сырые овощи — овощи
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { normCodeFor } from '../src/calc/catalog.js';
import { productEntry, normIdFor } from '../src/calc/products.js';

// #FR-85: группа норм — по записи словаря продуктов
const grp = (name) => normCodeFor(data.limits_ru, productEntry(data.products, name), 'fresh');

test('P2-3: сырое молоко и молоко цельное сырое — группа milk, не milk_products (п. 8 сыр)', () => {
  assert.equal(grp('Сырое молоко'), 'milk');
  assert.equal(grp('Молоко цельное сырое'), 'milk');
});

test('P2-3: сырой картофель, морковь сырая, сырые овощи, сырая свекла — vegetables', () => {
  for (const n of ['Сырой картофель', 'Морковь сырая', 'Сырые овощи', 'Сырая свекла']) assert.equal(grp(n), 'vegetables', n);
});

test('P2-3: настоящий сыр, брынза, сыр сырный остаются milk_products (п. 8)', () => {
  for (const n of ['Сыр', 'Брынза', 'Сыр сырой']) assert.equal(grp(n), 'milk_products', n);
  // #FR-85 v11: слово, не покрытое словарём («твёрдый»), — «частично»; после подтверждения — сыр (п. 8)
  // v13: «твёрдый» — нейтральное уточнение сыра (область p_syr) — принимается без подтверждения
  for (const n of ['Сыр косичка сырой']) { assert.equal(grp(n), null, n); assert.equal(normCodeFor(data.limits_ru, productEntry(data.products, n, 'p_syr'), 'fresh'), 'milk_products', n); }
});
