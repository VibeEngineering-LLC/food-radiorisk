// #FR-81: ПГП в режиме «с a до b» — по критической группе среди прожитых, не по взрослому (Sr-90 занижался в 2,86 раза)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const go = (lifetime) => run(null, 'молоко', [['Sr-90', 20]], { age: '5y', lifetime, years: 1, constantActivity: true, portionKg: 0.3, portionsPerYear: 365 }).rows[0];

test('ПГП Sr-90, с 3 до 13 лет: по группе 15 лет (8·10⁻⁸) = 1,25·10⁴ Бк/год, доля ПГП = наибольшая годовая доза / 1 мЗв', () => {
  const r = go({ fromAge: 3, toAge: 13 });
  assert.ok(Math.abs(r.pgpBqPerYear - 1e-3 / 8e-8) < 1e-6);
  assert.ok(Math.abs(r.pgpShare - 2190 * 8e-8 / 1e-3) < 1e-12);
});

test('ПГП Sr-90, с 30 до 40 лет: взрослый коэффициент (2,8·10⁻⁸)', () => {
  assert.ok(Math.abs(go({ fromAge: 30, toAge: 40 }).pgpBqPerYear - 1e-3 / 2.8e-8) < 1e-6);
});
