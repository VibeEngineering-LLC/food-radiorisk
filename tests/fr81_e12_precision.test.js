// #FR-81 E12: условие точности ΔB ≤ 0,3 (МУК п. 6.5) относится к несоответствующим продуктам; для «соответствует» его нет
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

test('E12: молоко A = 20, ΔA = 30,04 → B = 0,2, соответствует, точность не проверяется', () => {
  const c = run('milk', 'Молоко', [['Cs-137', 20, 30.04]]).limits.compliance;
  assert.equal(c.verdict, 'conforms');
  assert.ok(c.dB > 0.3);
  assert.equal(c.precisionOk, true);
});
test('E12: несоответствующий продукт с ΔB > 0,3 — точность не удовлетворяет', () => {
  const c = run('milk', 'Молоко', [['Cs-137', 200, 31]]).limits.compliance;
  assert.equal(c.verdict, 'nonconforms');
  assert.equal(c.precisionOk, false);
});
