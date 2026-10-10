// #FR-81 V5: семь записей Fr, где источник дал «до N %» / «не превышает N %» — это нижняя граница Fr (value_min), рекомендованного значения нет
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';

const CASES = [
  ['gudkov91_electrodialysis_cs', 0.01, 'Cs-137', /до 99 % \S+ Cs/],
  ['lysenko17_ion_exchange_resins', 0.1, 'Cs-137', /удаляют до 90% цезия/],
  ['yanin17_fish_boil_broth', 0.3, 'Cs-137', /в бульон до 70%/],
  ['marey74_fish_boil_sr_bone_broth', 0.99, 'Sr-90', /не превышает 1%/],
  ['lysenko17_acid_coag_sr', 0.15, 'Sr-90', /до 85% стронция/],
  ['melchenko16_potato_soak', 0.6, 'Cs-137', /выводится до 40 %/],
  ['melchenko16_mushrooms_first_broth', 0.6, 'Cs-137', /переходит до 40 %/],
];

const calc = (processing, nuc) => run('other', 'Сырьё', [[nuc, 100]], { processing });

test('V5: в данных граница только как value_min; value_best и value_max пусты; цитата источника содержит «до» / «не превышает»', () => {
  for (const [id, valueMin, nuc, quoteRegex] of CASES) {
    const rec = data.processing.find(r => r.id === id);
    assert.equal(rec.value_best, null, id);
    assert.equal(rec.value_min, valueMin, id);
    assert.equal(rec.value_max, null, id);
    assert.match(rec.quote, quoteRegex, id);
  }
});

test('V5: «рекомендованное» — ошибка (только нижняя граница); «минимум» считается: доза = value_min от дозы без обработки', () => {
  for (const [id, valueMin, nuc] of CASES) {
    if (!/^[A-Za-z]/.test(data.processing.find(r => r.id === id).nuclide)) continue; // #FR-88 v19 (Q1): запись «не уточнено» к нуклиду не применяется (Fr = 1) — проверяется в fr88_v19
    const best = calc({ mode: 'record', recordId: id, variant: 'best' }, nuc);
    assert.equal(best.ok, false, id);
    assert.match(best.errors[0], /только нижняя граница Fr = /, id);
    const min = calc({ mode: 'record', recordId: id, variant: 'min' }, nuc);
    assert.equal(min.ok, true, id);
    const none = calc({ mode: 'none', fr: 1, variant: 'best' }, nuc);
    assert.ok(Math.abs(min.rows[0].doseSvTotal / none.rows[0].doseSvTotal - valueMin) < 1e-9, id);
  }
});
