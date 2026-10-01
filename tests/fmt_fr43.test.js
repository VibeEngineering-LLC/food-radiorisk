import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtOneIn } from '../src/ui/fmt.js';

test('fmtOneIn: «1 из N», N = 1/p', () => {
  assert.equal(fmtOneIn(1 / 60100), '1 из 60 100');
  assert.equal(fmtOneIn(5e-5), '1 из 20 000');
});
test('fmtOneIn: от миллиона — «млн»', () => {
  assert.equal(fmtOneIn(2.5e-7), '1 из 4 млн');
  assert.equal(fmtOneIn(1e-6), '1 из 1 млн');
});
test('fmtOneIn: ноль, не число, отрицательное', () => {
  assert.equal(fmtOneIn(0), '0');
  assert.equal(fmtOneIn(NaN), '—');
  assert.equal(fmtOneIn(-1e-6), '—');
});
