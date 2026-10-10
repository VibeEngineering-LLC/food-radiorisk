// #FR-81 D06: Fr — подпись записи без рекомендованного значения, сообщение без имени поля, варианты min/max только для диапазонов
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import { processingOptions } from '../src/ui/form.js';
import { variantOffers, resolveProcessing } from '../src/calc/processing.js';

const fr = listChoices(data).processing;
const noBest = fr.find(r => r.value_best == null && r.value_max != null && r.value_min != null && r.value_min !== r.value_max);
// #FR-81 P2-6: в данных записей без каких-либо значений нет (были две — только с value_min); D06b проверяется на синтетической записи
const none = { id: 'x_none', quantity: 'Fr', process_ru: 'тест', value_best: null, value_min: null, value_max: null };
const rec = (id) => ({ processing: { mode: 'record', recordIds: [id], variant: 'best' } });

test('D06a: в списке запись без рекомендованного значения подписана «середина диапазона»', () => {
    const options = processingOptions({ processing: [noBest] }, noBest.nuclide, { processing: [noBest.food_group] }); // #FR-85: запись словаря с группой обработки
    const opt = options.find(o => o.id === noBest.id);
    assert.match(opt.label, /середина диапазона .*рекомендованного нет/);
});

test('D06b: запись без значений — сообщение без имени поля value_best', () => {
    assert.throws(() => resolveProcessing([none], rec(none.id).processing, [], () => {}), (e) => !/value_/.test(e.message) && /нет значения Fr/.test(e.message));
});

test('D06c: варианты «минимум/максимум» предлагаются только при диапазоне из двух разных значений', () => {
    assert.deepEqual(variantOffers([{ value_min: 0.5, value_max: 0.5 }, { value_min: null, value_max: null }]), { min: false, max: false });
    assert.deepEqual(variantOffers([{ value_min: 0.2, value_max: 0.8 }]), { min: true, max: true });
});
