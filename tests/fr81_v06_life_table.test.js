// #FR-81 V06: causeProb — вероятность умереть от причины за отрезок возраста (src/calc/life_table.js). Эталоны (2) и (3) — независимый пересчёт tools/risks_lifetime_ref.py по исходным таблицам Росстата/ВОЗ (#SA-10); разделы (1)–(4) собираются в один тест, чтобы каждая мутация красила ровно один тест
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { causeProb, makeLifeTable } from '../src/calc/life_table.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const T = makeLifeTable(data.life_risks);
const near = (a, e, tol) => Math.abs(a - e) <= tol;

const CODE = {
  lr_all_causes: '1000',
  lr_circulatory: '1064',
  lr_neoplasms: '1026',
  lr_lung_cancer: '1034',
  lr_external: '1095',
  lr_transport: '1096',
  lr_suicide: '1101',
  lr_poisoning: '1100',
  lr_homicide: '1102',
  lr_falls: '1097',
  lr_fire: '1099'
};

const REF3 = [
  ['1026', 3, 13, 'both', 0.0002564668402614273],
  ['1096', 3, 13, 'both', 0.00019131433868480808],
  ['1000', 3, 13, 'both', 0.0019072739291526566],
  ['1026', 3, 13, 'male', 0.0002995711154262284],
  ['1026', 3, 13, 'female', 0.00021082586442186047],
  ['1098', 3, 13, 'both', 0.00014825973044624093],
  ['1026', 33, 47.5, 'both', 0.007011657420510125],
  ['1099', 0, 85, 'both', 0.0014734907461756246],
  ['1097', 7.25, 61.5, 'male', 0.002652249266428194]
];

test('causeProb: (1) 22 значения набора, (2) до конца жизни и 20–30, (3) a = 3, b = 13 и не-узлы, (4) границы и монотонность', () => {
  const bad = [];

  // (1)
  let count = 0;
  for (const [id, code] of Object.entries(CODE)) {
    const rec = data.life_risks.find(x => x.id === id);
    if (!rec) {
      bad.push(`(1) missing ${id}`);
      continue;
    }
    for (const column of ['adult', 'child']) {
      const a = column === 'adult' ? 20 : 0;
      const expected = rec[column].both;
      const got = causeProb(T, code, a, 70);
      if (!near(got, expected, 1e-6)) {
        bad.push(`(1) ${id} ${column}`);
      }
      count++;
    }
  }
  if (count !== 22) {
    bad.push('(1) count');
  }
  
  // Check raw array vs table for code '1026', a = 20
  const rawGot = causeProb(data.life_risks, '1026', 20, 70);
  const tableGot = causeProb(T, '1026', 20, 70);
  if (rawGot !== tableGot) {
    bad.push('(1) array');
  }

  // (2)
  if (!near(causeProb(T, '1026', 20, Infinity), 0.1564102701984682, 1e-9)) bad.push('(2) 1026 inf 1');
  if (!near(causeProb(T, '1026', 20, Infinity), 0.15641, 1e-5)) bad.push('(2) 1026 inf 2');
  if (!near(causeProb(T, '1096', 20, 30), 0.0017612859425228816, 1e-9)) bad.push('(2) 1096 20-30 1');
  if (!near(causeProb(T, '1096', 20, 30), 0.00176129, 1e-8)) bad.push('(2) 1096 20-30 2');
  if (!near(causeProb(T, '1026', 20, 70), 0.07276244277880997, 1e-9)) bad.push('(2) 1026 20-70');
  if (!near(causeProb(T, '1000', 20, Infinity), 1, 1e-12)) bad.push('(2) 1000 inf');

  // (3)
  for (const [code, a, b, who, expected] of REF3) {
    const got = causeProb(T, code, a, b, who);
    if (!near(got, expected, 1e-9)) {
      bad.push(`(3) ${code} ${a}-${b} ${who}`);
    }
  }

  // (4)
  if (causeProb(T, '1026', 20, 20) !== 0) bad.push('(4) zero 20-20');
  if (causeProb(T, '1026', 0, 0) !== 0) bad.push('(4) zero 0-0');

  // Monotonicity
  const bValues = [20, 20.5, 21, 30, 33.3, 47.5, 60, 70, 84.9, 85, Infinity];
  let prev = -Infinity;
  let monoOk = true;
  for (const b of bValues) {
    const val = causeProb(T, '1026', 20, b);
    if (val < prev - 1e-15) {
      monoOk = false;
      break;
    }
    prev = val;
  }
  if (!monoOk) bad.push('(4) monotonic');

  if (!near(causeProb(T, '1000', 0, Infinity), 1, 1e-12)) bad.push('(4) 1000 0-inf');

  // Throws checks
  const throwsChecks = [
    { label: 'b<a', fn: () => causeProb(T, '1026', 20, 10), err: RangeError },
    { label: 'b>max', fn: () => causeProb(T, '1026', 20, 90), err: RangeError },
    { label: 'a<0', fn: () => causeProb(T, '1026', -1, 10), err: RangeError },
    { label: 'bad code', fn: () => causeProb(T, '9999', 20, 30), err: Error }
  ];

  for (const { label, fn, err } of throwsChecks) {
    try {
      fn();
      bad.push(`(4) throws ${label}`);
    } catch (e) {
      if (!(e instanceof err)) {
        bad.push(`(4) throws ${label}`);
      }
    }
  }

  assert.deepEqual(bad, []);
});
