// #FR-81: режим «с возраста a до возраста b» — конечный возраст задаётся; источник НРБ режим не выключает молча, а даёт понятную ошибку
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import { buildInput, lifetimeOf, yearsShown } from '../src/ui/form.js';
import { initialRaw, setField } from '../src/react/formState.js';

const ch = listChoices(data);
const go = (lifetime, over = {}, nuc = [['Sr-90', 20]]) => run(null, 'молоко', nuc, { age: '5y', lifetime, years: 1, constantActivity: true, portionKg: 0.3, portionsPerYear: 365, ...over });

test('a→b: с 3 до 13 лет (пример 2 метода): 4 года «5 лет», 5 лет «10 лет», 1 год «15 лет», E_N = 1,2439 мЗв', () => {
  const r = go({ fromAge: 3, toAge: 13 });
  assert.equal(r.period.years, 10);
  assert.deepEqual(r.rows[0].yearly.map(y => y.band), ['5y', '5y', '5y', '5y', '10y', '10y', '10y', '10y', '10y', '15y']);
  assert.ok(Math.abs(r.rows[0].doseSvTotal - 2190 * (4 * 4.7e-8 + 5 * 6e-8 + 8e-8)) < 1e-15);
});

test('a→b: неполный последний год входит с весом, срок = b − a', () => {
  const y = go({ fromAge: 3.5, toAge: 5.25 }).rows[0].yearly;
  assert.deepEqual(y.map(t => t.weight), [1, 0.75]);
  assert.ok(Math.abs(y[1].intakeBq - 0.75 * y[0].intakeBq) < 1e-9);
});

test('a→b: форма — конечный возраст берётся из поля, пустое поле — 70; поле «Сколько лет» показывает b − a', () => {
  let raw = setField(setField(initialRaw(ch), ch, 'lifeMode', true), ch, 'startAge', '3');
  raw = setField(raw, ch, 'endAge', '13');
  assert.deepEqual(buildInput(raw).lifetime, { fromAge: 3, toAge: 13 });
  assert.equal(yearsShown(raw), '10');
  assert.equal(lifetimeOf(setField(raw, ch, 'endAge', '')).toAge, 70);
});

test('a→b: конечный возраст не больше начального — ошибка; источник НРБ — одна понятная ошибка с предложением МКРЗ', () => {
  const bad = go({ fromAge: 10, toAge: 10 });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /конечный возраст — больше начального/);
  const nrb = go({ fromAge: 3, toAge: 13 }, { doseSource: 'NRB2009_App2' }, [['Sr-90', 20], ['Cs-137', 10]]);
  assert.equal(nrb.ok, false);
  assert.equal(nrb.errors.length, 1);
  assert.match(nrb.errors[0], /только для критической группы.*МКРЗ \(ICRP 119\)/);
});
