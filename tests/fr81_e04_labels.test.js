// #FR-81 E04: подпись группы норм РФ — название пункта Прил. 4 ТР ТС 021/2011, а не последней (служебной) записи группы
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';

const label = (code) => listChoices(data).limitGroups.find(g => g.code === code).ru;

test('E04: подписи семи групп, у которых раньше была чужая подпись', () => {
  assert.equal(label('fish'), 'Рыба и рыбные продукты');
  assert.equal(label('cereals'), 'Мука, крупы, хлопья, макаронные изделия');
  assert.equal(label('vegetables'), 'Овощи, корнеплоды включая картофель');
  assert.equal(label('berries_wild'), 'Дикорастущие ягоды и консервированные продукты из них');
  assert.match(label('baby_food'), /^Специализированные продукты детского питания/);
  assert.match(label('milk_products'), /^Молочные продукты, кроме молока/);
  assert.match(label('fats_oils'), /^Масла, жиры, спреды/);
});
test('E04: ни одна подпись не содержит «значение в скобках» и не взята у служебной записи', () => {
  for (const g of listChoices(data).limitGroups) assert.ok(!/значение в скобках|Молочная продукция общего назначения/.test(g.ru), `${g.code}: ${g.ru}`);
});
