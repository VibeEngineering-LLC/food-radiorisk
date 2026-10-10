// #FR-81 D09: ребёнок в режиме «сколько лет» — e(g) по возрасту в каждом году питания (МКРЗ 72 п. 24), младенец: первый год — группа «3 мес»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const go = (age, years, over = {}) => run(null, 'молоко', [['Sr-90', 20]], { age, years, constantActivity: true, portionKg: 0.4, portionsPerYear: 365, ...over }).rows[0];
const bands = (r) => r.yearly.map(y => y.band);

test('D09: младенец, 3 года: «3 мес», «1 год», «5 лет» — доза 0,6716 + 0,2132 + 0,1372 мЗв (пример 3 метода)', () => {
  const r = go('3m', 3);
  assert.deepEqual(bands(r), ['3m', '1y', '5y']);
  assert.ok(Math.abs(r.doseSvTotal - 2920 * (2.3e-7 + 7.3e-8 + 4.7e-8)) < 1e-15);
});

test('D09: группа «15 лет», 5 лет: два года 15y, затем взрослый (с 17 лет)', () => {
  const r = go('15y', 5);
  assert.deepEqual(bands(r), ['15y', '15y', 'adult', 'adult', 'adult']);
  assert.ok(Math.abs(r.doseSvTotal - 2920 * (2 * 8e-8 + 3 * 2.8e-8)) < 1e-15);
});

test('D09: группа «10 лет», 7 лет: 10y (10–11), 15y (12–16)', () => {
  assert.deepEqual(bands(go('10y', 7)), ['10y', '10y', '15y', '15y', '15y', '15y', '15y']);
});

test('D09: взрослый — один коэффициент; НРБ (только критическая группа) — один коэффициент на весь срок', () => {
  assert.ok(go('adult', 30).yearly.every(y => y.band === 'adult'));
  const n = go('12-17y', 5, { doseSource: 'NRB2009_App2' });
  assert.ok(n.yearly.every(y => y.band === null && y.eSvPerBq === 8e-8));
});
