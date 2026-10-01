import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtCases } from '../src/ui/fmt.js';
test('случаи на 1 млн: число и согласование слова', () => {
  assert.equal(fmtCases(1e-6), '1 случай');
  assert.equal(fmtCases(2e-6), '2 случая');
  assert.equal(fmtCases(5e-6), '5 случаев');
  assert.equal(fmtCases(1.11e-4), '111 случаев');
  assert.equal(fmtCases(1.21e-4), '121 случай');
  assert.equal(fmtCases(8.58e-6), '8,58 случая');
});
test('случаи на 1 млн: некорректный вход — прочерк', () => {
  assert.equal(fmtCases(NaN), '—');
  assert.equal(fmtCases(-1e-6), '—');
});
