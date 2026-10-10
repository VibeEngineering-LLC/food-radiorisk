// #FR-81 P2-4 (fix-review-1 №2): йогурт белковый — молоко (п. 5), а не концентрат молочных белков (п. 6)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normCodeFor } from '../src/calc/catalog.js';
import { productEntry, normIdFor } from '../src/calc/products.js';
import { pickNormRecord } from '../src/calc/norms.js';
import { data } from './fr81_helpers.js';

// #FR-85: группа норм — по записи словаря продуктов
const grp = (name) => normCodeFor(data.limits_ru, productEntry(data.products, name), 'fresh');
const pick = (name) => pickNormRecord(data.limits_ru, 'milk_products', 'Cs-137', normIdFor(productEntry(data.products, name), 'fresh'), 'fresh');

test('P2-4: йогурт белковый, йогурт с белком, творог белковый — группа milk (п. 5)', () => {
  // #FR-85 v11: «белковый», «белком» словарём не покрыты — «частично»; после подтверждения записи — молоко (п. 5), не концентрат (п. 6)
  for (const [n, id] of [['Йогурт белковый', 'p_yogurt'], ['Йогурт с белком', 'p_yogurt'], ['Творог белковый', 'p_tvorog']]) { assert.equal(grp(n), null, n); assert.equal(normCodeFor(data.limits_ru, productEntry(data.products, n, id), 'fresh'), 'milk', n); }
});

test('P2-4: концентрат молочных белков, белковый концентрат, казеин — п. 6', () => {
  for (const n of ['Концентрат молочных белков', 'Белковый концентрат молочный', 'Казеин']) assert.equal(pick(n).rec.id, 't021_p4_r06_cs137', n);
});
