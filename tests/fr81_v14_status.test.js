// #FR-81 V14: строка состояния — текст и цвет значка по худшему из вердикта ТР ТС и класса дозы (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { statusText, statusLevel } from '../src/ui/status.js';

const calcOf = (input) => ({ input, result: computeScenario(data, input) });
const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const S2 = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const S4 = () => inputFor('milk', 'молоко', [['Cs-137', 95, 7.8]], { age: '3m', portionKg: 0.5, portionsPerYear: 365, years: 1 });
const S5 = () => inputFor('mushrooms_fresh', 'грибы свежие', [['Cs-137', 400, 40]], { portionKg: 0.3, portionsPerYear: 60, years: 1 });
const norm = (s) => s.replace(/\s/g, ' ');

test('V14: текст строки состояния', () => {
  assert.equal(norm(statusText(calcOf(S1()))), 'Cs-137 · риск 16 на 1 000 000 за 10 лет · доза самого нагруженного года 33 мкЗв · ТР ТС: не соответствует');
  assert.ok(norm(statusText(calcOf(S2()))).includes('риск 87 на 1 000 000 с 3 до 13 лет · доза самого нагруженного года 210 мкЗв · ТР ТС: соответствует'));
  assert.ok(norm(statusText(calcOf(S2()))).startsWith('Cs-137, Sr-90 · '));
  assert.equal(statusText(null), 'Загрузка данных…');
  assert.equal(statusText({ input: {}, result: { ok: false } }), 'Расчёт не выполнен — исправьте ввод');
  assert.ok(statusText(calcOf(inputFor(null, 'вода', [['Ra-226', 1]], {}))).includes('только природные нуклиды'));
});

test('V14: цвет значка — худший из вердикта и класса дозы (S1 красный, S5 зелёный, S4 жёлтый)', () => {
  assert.equal(statusLevel(calcOf(S1())), 'bad');
  assert.equal(statusLevel(calcOf(S5())), 'ok');
  assert.equal(statusLevel(calcOf(S4())), 'warn');
});

test('V14: без вердикта цвет — по классу дозы; ошибка и загрузка', () => {
  assert.equal(statusLevel(calcOf(inputFor(null, 'молоко', [['Cs-137', 1.5e-3 / 1.3e-8]], { portionKg: 1, portionsPerYear: 1, constantActivity: true }))), 'bad');
  assert.equal(statusLevel(calcOf(inputFor(null, 'молоко', [['Cs-137', 5e-6 / 1.3e-8]], { portionKg: 1, portionsPerYear: 1, constantActivity: true }))), 'ok');
  assert.equal(statusLevel({ error: 'x' }), 'bad');
  assert.equal(statusLevel(null), '');
  assert.equal(statusLevel({ input: {}, result: { ok: false } }), 'bad');
});
