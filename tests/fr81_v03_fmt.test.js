// #FR-81 V03: форматы чисел главного экрана — на 1 000 000, 2 значащие цифры (D-022, спецификация разд. 3.4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtPerMillion, fmtCount, fmtDose2, fmtPct2 } from '../src/ui/fmt.js';

const n = (s) => s.replace(/[\u00A0\u2009\u200A\u200B\u202F\u205F\u3000]/g, ' ');

test('V03: fmtPerMillion', () => {
  assert.equal(n(fmtPerMillion(16.25e-6)), '16');
  assert.equal(n(fmtPerMillion(86.73e-6)), '87');
  assert.equal(n(fmtPerMillion(4.626e-6)), '4,6');
  assert.equal(n(fmtPerMillion(0.7711e-6)), '0,8');
  assert.equal(n(fmtPerMillion(0.84e-6)), '0,8');
  assert.equal(n(fmtPerMillion(0.009e-6)), 'меньше 0,01');
  assert.equal(n(fmtPerMillion(1735.4e-6)), '1700');
  assert.equal(n(fmtPerMillion(0)), '0');
  assert.equal(n(fmtPerMillion(NaN)), '—');
});

test('V03: fmtCount', () => {
  assert.equal(n(fmtCount(156410)), '160 000');
  assert.equal(n(fmtCount(1761)), '1800');
  assert.equal(n(fmtCount(16.25)), '16');
  assert.equal(n(fmtCount(NaN)), '—');
});

test('V03: fmtDose2', () => {
  assert.equal(n(fmtDose2(32.5e-6)), '33 мкЗв');
  assert.equal(n(fmtDose2(1735e-6)), '1,7 мЗв');
  assert.equal(n(fmtDose2(211.4e-6)), '210 мкЗв');
  assert.equal(n(fmtDose2(999.6e-6)), '1 мЗв');
  assert.equal(n(fmtDose2(994e-6)), '990 мкЗв');
  assert.equal(n(fmtDose2(0)), '0 Зв');
  assert.equal(n(fmtDose2(2.5)), '2,5 Зв');
});

test('V03: fmtPct2', () => {
  assert.equal(n(fmtPct2(0.0325)), '3,3 %');
  assert.equal(n(fmtPct2(0.004643)), '0,46 %');
  assert.equal(n(fmtPct2(0.3)), '30 %');
  assert.equal(n(fmtPct2(NaN)), '—');
});
