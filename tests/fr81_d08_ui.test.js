// #FR-81 D08: на экране — пометка про распад и отметка «активность постоянна» (серверный рендер Result и Form)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screen, ch } from './render_scenario.js';
import * as S from '../src/react/formState.js';

const NOTE = /учтён только радиоактивный распад; очищение почвы и продуктов не учтено — оценка консервативна/;

test('D08: при питании больше года на экране пометка про распад, для одного года её нет', async () => {
  assert.match((await screen({ field: { years: '10' } })).html, NOTE);
  assert.doesNotMatch((await screen({ field: { years: '1' } })).html, NOTE);
});

test('D08: отметка «активность постоянна» есть в форме и попадает в ввод расчёта', async () => {
  const f = await screen({ comp: ['src/react/Form.jsx', 'default', () => ({ choices: ch, raw: S.initialRaw(ch), setRaw() {}, tab: 1, setTab() {}, onPreset() {}, onExport() {} })] });
  assert.match(f.html, /Активность продукта постоянна во все годы/);
  const s = await screen({ field: { constAct: true } });
  assert.equal(s.input.constantActivity, true);
  assert.equal((await screen({})).input.constantActivity, false);
});
