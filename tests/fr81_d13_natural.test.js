// #FR-81 D13: природные нуклиды — не входят в долю 1 мЗв и ПГП, на экране об этом строка
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const W = /для природных нуклидов \(([^)]+)\) предел 1 мЗв\/год и ПГП не применяются \(НРБ-99\/2009 п\. 3\.1\.3\)/;
test('D13: Ra-226 + Cs-137 — строка о природных нуклидах названа, доля предела только по Cs-137', () => {
  const r = run(null, 'вода', [['Ra-226', 1], ['Cs-137', 10]]);
  const w = r.warnings.find(x => W.test(x));
  assert.ok(w);
  assert.equal(w.match(W)[1], 'Ra-226');
  assert.deepEqual(r.totals.techNuclides, ['Cs-137']);
  assert.ok(Math.abs(r.totals.budgetShare1mSvAvg5 - r.rows[1].doseSvPerYear / 5 / 1e-3) < 1e-15); // срок 1 год: Ē₅ = E / 5 (метод, шаг 8.2)
});
test('D13: только техногенные — строки нет', () => {
  assert.ok(!run(null, 'молоко', [['Cs-137', 10]]).warnings.some(x => W.test(x)));
});
