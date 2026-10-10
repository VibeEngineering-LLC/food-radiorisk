// #FR-81 E11: B считается по Cs-137 и Sr-90; не введён нормируемый нуклид — предупреждение
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const W = /B рассчитан не по всем нормируемым нуклидам/;
test('E11: молоко, введён только Cs-137 → предупреждение о Sr-90', () => {
  const r = run('milk', 'Молоко', [['Cs-137', 90]]);
  assert.equal(r.limits.compliance.verdict, 'conforms');
  assert.ok(r.warnings.some(w => W.test(w) && /Sr-90/.test(w)));
});
test('E11: введены оба нуклида — предупреждения нет', () => {
  assert.ok(!run('milk', 'Молоко', [['Cs-137', 90], ['Sr-90', 5]]).warnings.some(w => W.test(w)));
});
test('E11: мука — Sr-90 не нормируется, одного Cs-137 достаточно', () => {
  assert.ok(!run('cereals', 'Мука пшеничная', [['Cs-137', 30]]).warnings.some(w => W.test(w)));
});
