// #FR-81 D21: ручной выбор группы норм (groupUser) сохраняется при перезагрузке страницы
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { serialize, restore } from '../src/react/persist.js';

const ch = listChoices(data), base = S.initialRaw(ch);
test('D21: groupUser есть в исходном состоянии и переживает serialize → restore', () => {
  assert.equal(base.groupUser, false);
  const picked = S.setField(S.setField(base, ch, 'product', 'молоко'), ch, 'foodGroup', 'milk_products');
  assert.equal(picked.groupUser, true);
  const back = restore(serialize(picked, 0), base, ch.nuclides).raw;
  assert.equal(back.groupUser, true);
  assert.equal(back.foodGroup, 'milk_products');
});
test('D21: после перезагрузки ручная группа не затирается автоподбором по названию', () => {
  const picked = S.setField(S.setField(base, ch, 'product', 'молоко'), ch, 'foodGroup', 'milk_products');
  const back = restore(serialize(picked, 0), base, ch.nuclides).raw;
  assert.equal(S.autoFill(back, ch).foodGroup, 'milk_products');
});
