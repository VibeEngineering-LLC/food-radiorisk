// #FR-81 D11: эквиваленты (дни фона, снимки, полёты) на вкладке сравнения — за 1 год питания и за весь срок
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';
import { screen } from './render_scenario.js';

const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} ≠ ${b}`);
const cmp = (years) => run(null, 'молоко', [['Cs-137', 1000]], { years, constantActivity: true }).comparison;
const view = ['src/react/Compare.jsx', 'default', (result, input) => ({ comparison: result.comparison, input, radonC: 100, setRadonC() {}, dwellU: NaN, setDwellU() {} })];

test('D11: за 10 лет питания эквиваленты и добавка к риску заданы и за 1 год, и за срок (постоянное питание: срок = 10 × год)', () => {
  const c = cmp(10);
  near(c.equivalents.bgDays, 10 * c.equivalents1.bgDays);
  near(c.equivalents.chestXrays, 10 * c.equivalents1.chestXrays);
  near(c.equivalents.flightHours, 10 * c.equivalents1.flightHours);
  near(c.oneYearSv * 10, c.scenarioSv);
});

test('D11: при питании один год вторых значений нет', () => {
  const c = cmp(1);
  assert.equal(c.equivalents1, null);
});

test('D11: на экране «За 1 год питания: …» и «За 10 лет питания: …», добавка к риску рака — оба срока', async () => {
  const { html } = await screen({ field: { years: '10', constAct: true }, comp: view });
  assert.match(html, /За 1 год питания: /);
  assert.match(html, /За 10 лет питания: /);
  const one = await screen({ field: { years: '1' }, comp: view });
  assert.doesNotMatch(one.html, /За 1 год питания/);
});
