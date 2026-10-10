// #FR-81 V3-2: предупреждение про зарубежные нормы и коэффициент сушки не читается как противоречие подсказке ТР ТС
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const dry = (over) => run('mushrooms_dried', 'грибы', [['Cs-137', 2000]], { product: { name: 'грибы', state: 'dried' }, ...over });
const warn = (r) => r.warnings.find(w => /готовом \(восстановленном\)/.test(w));

test('V3-2: K не введён — текст: (а) зарубежные нормы, (б) подсказка сама не подставляется, (в) что сделать', () => {
  const w = warn(dry({ dryingFactor: null }));
  assert.ok(w, 'предупреждения нет');
  assert.match(w, /^зарубежные нормы заданы для продукта в готовом \(восстановленном\) виде/);
  assert.match(w, /подсказки ТР ТС \(он для норм РФ\) в зарубежное сравнение сам не подставляется/);
  assert.match(w, /введите его в поле «Коэффициент концентрирования при сушке»/);
  assert.ok(!/не задан, пересчёт/.test(w));
});
test('V3-2: K введён — предупреждения нет', () => {
  assert.equal(warn(dry({ dryingFactor: 5 })), undefined);
});
