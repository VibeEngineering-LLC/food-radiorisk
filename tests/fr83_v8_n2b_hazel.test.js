// #FR-83 v8 Н-2: «лещина» (орех) не рыба ни в fish_river (основа «лещ»), ни в fish (категория каталога «рыба»); сам лещ — fish_river
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { dietGroupFor } from '../src/calc/diet.js';
const code = (n) => dietGroupFor(data.diet, n, data.products)?.code ?? 'other'; // #FR-85: null — запись словаря без группы рациона (не установлено), как other
test('лещина, орех лещина, лещины — группа «продукт не распознан»', () => {
    for (const n of ['лещина', 'Орех лещина', 'лещины']) assert.equal(code(n), 'other', n);
});
test('лещ, лещ вяленый, филе леща — речная рыба', () => {
    for (const n of ['лещ', 'Лещ вяленый', 'филе леща']) assert.equal(code(n), 'fish_river', n);
});
