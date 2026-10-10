// #FR-81 D17: поле «Сколько лет» и подсказка рациона показывают тот срок, что считается
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import { yearsShown } from '../src/ui/form.js';
import { initialRaw, setField, hints } from '../src/react/formState.js';

const ch = listChoices(data);
const life = (start, over = {}) => ({ ...setField(setField(initialRaw(ch), ch, 'lifeMode', true), ch, 'startAge', start), years: '3', ...over });
test('D17: режим «с N до M» действует — показано 70 − N', () => {
  assert.equal(yearsShown(life('20')), '50');
});
test('D17: источник НРБ режим не выключает (срок b − a, ошибку даёт расчёт); пустой начальный возраст — поле пустое', () => {
  assert.equal(yearsShown(life('20', { doseSource: 'NRB2009_App2' })), '50');
  assert.equal(yearsShown(life('')), '');
});
test('D17: подсказка рациона в режиме «с N до M» считает кг за 50 лет', () => {
  const raw = { ...life('20'), dietMode: 'own', portionG: '100', timesPerDay: '1', daysPerWeek: '1', weeksPerMonth: '1', monthsPerYear: '1' };
  assert.match(hints(raw, ch).diet, /кг за 50 г\./);
});
