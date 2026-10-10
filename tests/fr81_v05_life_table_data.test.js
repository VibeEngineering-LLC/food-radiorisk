// #FR-81 V05: таблица дожития и доли причин в наборе life_risks (экспорт tools/risks_lifetime_calc.py --export-table)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const lts = data.life_risks.filter(x => x.kind === 'life_table');
const cs = data.life_risks.filter(x => x.kind === 'cause_shares');
const byCode = (c) => cs.find(x => x.code === c);

test('одна запись lx: узлы, 22 значения на пол, рождение 100 000, нет роста, 19 групп с открытой 85+', () => {
  assert.equal(lts.length, 1);
  const t = lts[0];
  assert.deepEqual(t.nodes, [0,1,2,3,4,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85]);
  for (const s of ['male', 'female']) {
    assert.equal(t.lx[s].length, 22);
    assert.equal(t.lx[s][0], 100000);
    for (let i = 1; i < 22; i++) {
      assert.ok(t.lx[s][i] <= t.lx[s][i-1]);
    }
  }
  assert.deepEqual([t.lx.male[8], t.lx.female[8], t.lx.male[18], t.lx.female[18]], [98724, 99127, 51678, 78418]);
  assert.deepEqual(t.births, {male: 762058, female: 719016});
  assert.equal(t.groups.length, 19);
  assert.deepEqual(t.groups[18], [85, null]);
});

test('доли причин: 12 кодов, доля = умершие от причины / умершие от всех причин, 1026 с пометкой, 1098 со сверкой', () => {
  const codes = cs.map(x => x.code).sort();
  assert.deepEqual(codes, ['1000','1026','1034','1064','1095','1096','1097','1098','1099','1100','1101','1102']);
  const all = byCode('1000');
  for (const x of cs) {
    for (const s of ['male', 'female']) {
      assert.equal(x.share[s].length, 19);
      for (let i = 0; i < 19; i++) {
        const v = x.share[s][i];
        const expected = all.deaths[s][i] ? x.deaths[s][i] / all.deaths[s][i] : 0;
        assert.ok(Math.abs(v - expected) < 1e-12);
      }
    }
  }
  assert.ok(byCode('1026').note.includes('C00–C97'));
  assert.ok(byCode('1026').label_ru.includes('рака и других опухолей'));
  assert.ok(byCode('1098').rosstat_check.includes('4 068'));
});
