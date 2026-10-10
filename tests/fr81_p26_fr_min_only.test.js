// #FR-81 P2-6 (fix-review-1 №4): Fr только с нижней границей (value_min) доступен через вариант «минимум»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import { variantOffers, isGenericNuclide } from '../src/calc/processing.js';

const onlyMin = listChoices(data).processing.filter(r => r.value_best == null && r.value_max == null && r.value_min != null);
const inp = (id, variant) => ({ processing: { mode: 'record', recordIds: [id], variant } });

test('P2-6: в данных три записи только с value_min (два бульона и TECDOC-1616 «спирт, масло»: до 99 %), и «минимум» для них предлагается', () => {
    const ids = onlyMin.map(r => r.id).sort();
    // #FR-81 V5: ещё семь записей «до N %» / «не превышает N %» переведены из value_best в value_min (gudkov91, lysenko17 x2, yanin17, marey74 кости, melchenko16 x2)
    assert.deepEqual(ids, ['gudkov91_electrodialysis_cs', 'lysenko17_acid_coag_sr', 'lysenko17_ion_exchange_resins', 'marey74_fish_boil_broth', 'marey74_fish_boil_sr_bone_broth', 'melchenko16_mushrooms_first_broth', 'melchenko16_potato_soak', 'tec16_txt_alcohol_oil', 'vasilenko01_meat_broth', 'yanin17_fish_boil_broth']); // #FR-81 V4-4: tec16_txt_alcohol_oil — 0.01 это нижняя граница («до 99 %»), а не рекомендованное
    assert.deepEqual(variantOffers(onlyMin), { min: true, max: false });
});

test('P2-6: вариант «минимум» для такой записи считается (Fr = value_min), «рекомендованное» — понятная ошибка с указанием на «минимум»', () => {
    for (const r of onlyMin) {
        const resMin = run(null, 'продукт', [['Cs-137', 10]], inp(r.id, 'min'));
        assert.equal(resMin.ok, true);

        const resBest = run(null, 'продукт', [['Cs-137', 10]], inp(r.id, 'best'));
        if (isGenericNuclide(r)) continue; // #FR-88 v19 (Q1): запись «не уточнено» к Cs-137 не применяется — Fr = 1, ошибки нет
        assert.equal(resBest.ok, false);
        assert.match(resBest.errors[0], /только нижняя граница/);
        assert.match(resBest.errors[0], /«минимум»/);
    }
});
