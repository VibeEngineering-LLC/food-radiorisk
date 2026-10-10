// #FR-81 V4-1: групповая сумма зарубежных норм включает все нуклиды записи (I-131 в группе Codex «Sr-90, Ru-106, I-129, I-131, U-235»)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';
import { inItem } from '../src/calc/model.js';

const byId = (r, id) => r.limits.foreign.filter(f => f.id === id);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('V4-1: Sr-90 и I-131 по 0,01 Бк/кг — группа Codex одна строка, сумма 0,02, A/H = 2e-4; цезий в эту группу не входит', () => {
  const r = run('meat', 'Говядина', [['Cs-137', 0.01], ['Sr-90', 0.01], ['I-131', 0.01]]);
  const g = byId(r, 'codex_cxs193_other_sr90_group');
  assert.equal(g.length, 1);
  assert.deepEqual([...g[0].nuclides].sort(), ['I-131', 'Sr-90']);
  close(g[0].activity, 0.02);
  close(g[0].ratio, 2e-4);
  assert.deepEqual(byId(r, 'codex_cxs193_other_cs_group')[0].nuclides, ['Cs-137']);
  // I-131 есть и в нормах, названных группой («notably I-131»), и по имени
  close(byId(r, 'eu_2016_52_a1_i_other')[0].ratio, 0.01 / 2000);
  close(byId(r, 'us_fda_dil_i131')[0].ratio, 0.01 / 170);
  // вода: уровни ВОЗ — каждый нуклид своей строки отдельно, не суммируются
  const w = run('water', 'Вода питьевая', [['I-131', 1], ['U-238', 0.5]]);
  const who = byId(w, 'iaea_tecdoc1788_who_sr90_i131_cs_u238');
  assert.equal(who.length, 2);
  assert.ok(who.every(e => e.nuclides.length === 1));
});

test('V4-1: нуклид назван в записи целиком — «C-14» не найден в «Ce-144», «U-238» в «Pu-238», «I-13» в «I-131»', () => {
  assert.equal(inItem('Ce-144', 'C-14'), false);
  assert.equal(inItem('Pu-238', 'U-238'), false);
  assert.equal(inItem('I-131', 'I-13'), false);
  assert.equal(inItem('H-3 (organically bound)', 'H-3'), true);
  assert.equal(inItem('group: Sum of isotopes of iodine, notably I-131', 'I-131'), true);
});
