// #FR-109: два примера — грибы (прежний) и черника дикорастущая сушёная (Cs-137 4400 + Sr-90 100)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { data } from './fr81_helpers.js';
import { listChoices, computeScenario } from '../src/calc/model.js';
import { presetRadGear, presetBilberry } from '../src/ui/form.js';
import * as S from '../src/react/formState.js';

const ch = listChoices(data);
const go = (p) => { const raw = S.autoFill(S.rawFromInput(p, ch), ch), // как в App.jsx onPreset
 input = S.toInput(raw, ch); return { raw, input, r: computeScenario(data, { region: 'ru', ...input }) }; };

test('FR-109: пример «грибы» не изменился и считается', () => {
  const { input, r } = go(presetRadGear());
  assert.equal(r.ok, true, r.errors?.join('; '));
  assert.deepEqual([input.foodGroupCode, input.nuclides[0].measuredBqPerKg], ['mushrooms_dried', 9800]);
});

test('FR-109: пример «черника» — ok-расчёт, группа ТР ТС «дикорастущие ягоды», K = 5, два нуклида', () => {
  const { raw, input, r } = go(presetBilberry());
  assert.equal(r.ok, true, r.errors?.join('; '));
  assert.equal(raw.foodGroup, 'berries_wild');
  assert.equal(input.foodGroupCode, 'berries_wild');
  assert.match(ch.limitGroups.find(g => g.code === 'berries_wild').ru, /Дикорастущие ягоды/);
  assert.equal(input.dryingFactor, 5);
  assert.deepEqual(r.rows.map(x => x.nuclide), ['Cs-137', 'Sr-90']);
  assert.deepEqual(input.nuclides.map(n => n.measuredBqPerKg), [4400, 100]);
  assert.equal(input.product.state, 'dried');
});

test('FR-109: в строке состояния две кнопки примера', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/react/App.jsx', import.meta.url)), 'utf8');
  assert.match(src, /id="preset"[^\n]*>Пример: грибы</);
  assert.match(src, /id="presetBilberry"[^\n]*>Пример: черника</);
});
