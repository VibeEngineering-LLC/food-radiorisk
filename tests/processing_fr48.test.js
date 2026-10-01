import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineFr } from '../src/calc/processing.js';
const it = (value, cumulative = null) => ({ rec: { cumulative }, value });
test('один способ — Fr без изменений', () => {
  assert.equal(combineFr([it(0.4)]).fr, 0.4);
});
test('поэтапные способы перемножаются', () => {
  const r = combineFr([it(0.5), it(0.2, false), it(0.5, null)]);
  assert.ok(Math.abs(r.fr - 0.05) < 1e-12);
  assert.equal(r.stagedCount, 3);
});
test('накопленные друг с другом не перемножаются: берётся наибольшее', () => {
  const r = combineFr([it(0.3, true), it(0.1, true)]);
  assert.equal(r.fr, 0.3);
  assert.equal(r.cumulativeCount, 2);
});
test('накопленное и поэтапное: произведение', () => {
  assert.ok(Math.abs(combineFr([it(0.3, true), it(0.5)]).fr - 0.15) < 1e-12);
});
test('пустой список — Fr = 1', () => {
  assert.equal(combineFr([]).fr, 1);
});
