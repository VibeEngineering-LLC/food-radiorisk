// #FR-41: рацион — раз в день × дней в неделю × недель в месяц × месяцев в году
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perMonth, buildInput } from '../src/ui/form.js';

test('порций в месяц и в год из частоты', () => {
  assert.equal(perMonth({ timesPerDay: '2', daysPerWeek: '3', weeksPerMonth: '4' }), 24);
  const i = buildInput({ portionG: '50', timesPerDay: '2', daysPerWeek: '3', weeksPerMonth: '4', monthsPerYear: '3', years: '1', nuclides: [] });
  assert.deepEqual([i.portionsPerYear, i.portionKg], [72, 0.05]);
});

test('пустое поле частоты — порций нет (не ноль и не NaN)', () => {
  assert.equal(perMonth({ timesPerDay: '2', daysPerWeek: '', weeksPerMonth: '4' }), null);
  assert.equal(buildInput({ portionG: '50', timesPerDay: '', daysPerWeek: '3', weeksPerMonth: '4', monthsPerYear: '3', nuclides: [] }).portionsPerYear, null);
});
