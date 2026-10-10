// #FR-81 P2-5 (fix-review-1 №7): масло топлёное — молочный жир (п. 10); «масло» без уточнения — п. 20 с предупреждением
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normCodeFor } from '../src/calc/catalog.js';
import { productEntry, normIdFor } from '../src/calc/products.js';
import { pickNormRecord } from '../src/calc/norms.js';
import { data, run } from './fr81_helpers.js';

// #FR-85: группа и пункт — по записи словаря продуктов
const ent = (name) => productEntry(data.products, name);
const grp = (name) => normCodeFor(data.limits_ru, ent(name), 'fresh');

test('P2-5: масло топлёное и топленое масло — п. 10 (Cs 200), не п. 20 (40)', () => {
  for (const n of ['Масло топлёное', 'Топленое масло']) {
    assert.equal(pickNormRecord(data.limits_ru, grp(n), 'Cs-137', normIdFor(ent(n), 'fresh'), 'fresh').rec.id, 't021_p4_r10_cs137', n);
  }
});

// #FR-85: «масло» без уточнения в словаре не распознаётся (сливочное п. 10 или растительное п. 20) — при группе масел берётся
// самая строгая норма группы (п. 20, 40 Бк/кг) с предупреждением «уточните название продукта»; прежний текст «вид масла не определён» снят
test('P2-5: «масло» без уточнения — самая строгая норма группы с предупреждением; «масло подсолнечное» — без него', () => {
  assert.equal(ent('Масло'), null);
  const r = run('fats_oils', 'Масло', [['Cs-137', 10]]);
  assert.equal(r.limits.ru[0].H, 40);
  assert.ok(r.warnings.some(w => /несколько норм.*уточните название продукта/.test(w)), r.warnings.join('|'));
  assert.ok(!run('fats_oils', 'Масло подсолнечное', [['Cs-137', 10]]).warnings.some(w => /несколько норм/.test(w)));
});
