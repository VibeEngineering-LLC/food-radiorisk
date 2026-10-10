// #FR-81 D03: доза локализаций рака по FGR 13 табл. 7.4 на реальных данных (Cs-137, взрослый)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';

const r = run(null, 'молоко', [['Cs-137', 1000]]);
const raw = r.organs.rawSv, site = (id) => r.organRisk.sites.find(s => s.id === id).organDose.doseSv;
const close = (a, e) => assert.ok(Math.abs(a - e) <= 1e-9 * Math.abs(e), `${a} != ${e}`);

test('D03: толстая кишка = 0,568·ULI + 0,432·LLI (а не большее из двух)', () => {
  close(site('colon'), 0.568 * raw.ULI_Wall + 0.432 * raw.LLI_Wall);
});
test('D03: лёгкое = (BBi-bas + BBi-sec)/6 + (bbe-sec + AI)/3', () => {
  close(site('lung'), (raw['BBi-bas'] + raw['BBi-sec']) / 6 + (raw['bbe-sec'] + raw.AI) / 3);
  assert.ok(site('lung') > 0);
});
test('D03: пищевод = вилочковая железа; прочие = (мышцы + поджелудочная + надпочечники)/3', () => {
  close(site('esophagus'), raw.Thymus);
  close(site('residual'), (raw.Muscle + raw.Pancreas + raw.Adrenals) / 3);
});
