// #FR-81 E01: пункт нормы ТР ТС 021/2011 Прил. 4 внутри группы выбирается по названию продукта, а не «первая запись группы»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';
import { pickNormRecord } from '../src/calc/norms.js';
import { productEntry, normIdFor } from '../src/calc/products.js';
// #FR-85: пункт задаёт запись словаря продуктов (norm.fresh/dried), не разбор названия
const nid = (name, state, nuc = 'Cs-137') => normIdFor(productEntry(data.products, name), state, nuc);

test('E01: milk_products — пункт по названию (сыр 50, масло 200, молочный жир 100, сгущённое 300, казеин 300, сухое молоко 500)', () => {
    const cases = [
        ['Сыр', 'fresh', 't021_p4_r08_cs137'],
        ['Масло сливочное', 'fresh', 't021_p4_r10_cs137'],
        ['Молочный жир', 'fresh', 't021_p4_r10_milkfat_cs137'],
        ['Молоко сгущённое', 'fresh', 't021_p4_r09_cs137'],
        ['Казеин', 'fresh', 't021_p4_r06_cs137'],
        ['Молоко сухое', 'dried', 't021_p4_r07_cs137']
    ];

    for (const [productName, state, expectedId] of cases) {
        const { rec } = pickNormRecord(data.limits_ru, 'milk_products', 'Cs-137', nid(productName, state), state);
        assert.equal(rec.id, expectedId, `Продукт: ${productName}`);
    }
});

test('E01: fats_oils — масло растительное 40, маргарин 60, спред 100 (Cs-137)', () => {
    const cases = [
        ['Масло подсолнечное', 'fresh', 't021_p4_r20_cs137'],
        ['Маргарин', 'fresh', 't021_p4_r21_cs137'],
        ['Спред растительно-сливочный', 'fresh', 't021_p4_r22_cs137']
    ];

    for (const [productName, state, expectedId] of cases) {
        const { rec } = pickNormRecord(data.limits_ru, 'fats_oils', 'Cs-137', nid(productName, state), state);
        assert.equal(rec.id, expectedId, `Продукт: ${productName}`);
    }
});

test('E01: Sr-90 — сыр берёт 100 (п. 8), а не 80 (п. 6)', () => {
    const { rec } = pickNormRecord(data.limits_ru, 'milk_products', 'Sr-90', nid('Сыр', 'fresh', 'Sr-90'), 'fresh');
    assert.equal(rec.value, 100);
});

test('E01: название не определяет пункт — берётся самая строгая норма и даётся предупреждение', () => {
    const { rec, ambiguous } = pickNormRecord(data.limits_ru, 'milk_products', 'Cs-137', nid('продукт', 'fresh'), 'fresh');
    assert.equal(rec.value, 50);
    assert.equal(ambiguous, true);

    const result = run('milk_products', 'продукт', [['Cs-137', 10]]);
    assert.ok(result.warnings.some(w => /несколько норм/.test(w)), 'Ожидалось предупреждение о нескольких нормах');
});

test('E01: сценарий — сыр 100 Бк/кг: H = 50, A/H = 2, не соответствует; растительное масло 50 Бк/кг: H = 40, не соответствует', () => {
    const res1 = run('milk_products', 'Сыр', [['Cs-137', 100]]);
    assert.equal(res1.limits.ru[0].H, 50);
    assert.equal(res1.limits.ru[0].ratio, 2);
    assert.equal(res1.limits.compliance.verdict, 'nonconforms');

    const res2 = run('fats_oils', 'Масло подсолнечное', [['Cs-137', 50]]);
    assert.equal(res2.limits.ru[0].H, 40);
    assert.equal(res2.limits.compliance.verdict, 'nonconforms');

    // масло сливочное — п. 10 (200), а не самая строгая норма группы (50): 150 Бк/кг соответствует
    const res3 = run('milk_products', 'Масло сливочное', [['Cs-137', 150]]);
    assert.equal(res3.limits.ru[0].H, 200);
    assert.equal(res3.limits.compliance.verdict, 'conforms');
});
