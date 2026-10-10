// #FR-81 E09: применимость зарубежных норм по классам продукта — действует норма самой узкой категории; общие нормы (Codex, FDA) применимы к молоку и детскому питанию
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, data } from './fr81_helpers.js';
import { foreignClasses, productClasses, classesFor } from '../src/calc/foodclass.js';
import { productEntry } from '../src/calc/products.js';
import { normCodeFor } from '../src/calc/catalog.js';

// Вспомогательная функция: возвращает массив id зарубежных норм для сценария
const ids = (group, name, nuc = [['Cs-137', 100]]) => run(group, name, nuc).limits.foreign.map(f => f.id);

// Проверка наличия id в массиве
const has = (arr, id) => arr.includes(id);

test('E09: молоко — показаны молочные нормы Японии/Euratom/ЕС и общие нормы Codex/FDA; «прочие» нормы Японии/Euratom/ЕС не показаны', () => {
    const x = ids('milk', 'Молоко');
    // Должны присутствовать молочные и общие нормы
    assert.ok(has(x, 'jp_cs_milk'), 'jp_cs_milk');
    assert.ok(has(x, 'eu_2016_52_a1_other_cs_dairy'), 'eu_2016_52_a1_other_cs_dairy');
    assert.ok(has(x, 'eu_2020_1158_cs137_milk_infant'), 'eu_2020_1158_cs137_milk_infant');
    assert.ok(has(x, 'codex_cxs193_other_cs_group'), 'codex_cxs193_other_cs_group');
    assert.ok(has(x, 'us_fda_dil_cs134_137'), 'us_fda_dil_cs134_137');
    // Не должны присутствовать нормы для «прочих» продуктов
    assert.ok(!has(x, 'jp_cs_general_foods'), 'jp_cs_general_foods');
    assert.ok(!has(x, 'eu_2016_52_a1_other_cs_other'), 'eu_2016_52_a1_other_cs_other');
    assert.ok(!has(x, 'eu_2020_1158_cs137_other'), 'eu_2020_1158_cs137_other');
});

test('E09: детское питание — нормы для младенцев и единые нормы FDA (Cs и Sr), общие нормы Codex/Японии не показаны', () => {
    const x = ids('baby_food', 'Детская молочная смесь', [['Cs-137', 100], ['Sr-90', 10]]);
    // Должны присутствовать нормы для младенцев и FDA
    assert.ok(has(x, 'codex_cxs193_infant_cs_group'), 'codex_cxs193_infant_cs_group');
    assert.ok(has(x, 'jp_cs_infant_foods'), 'jp_cs_infant_foods');
    assert.ok(has(x, 'us_fda_dil_cs134_137'), 'us_fda_dil_cs134_137');
    assert.ok(has(x, 'us_fda_dil_sr90'), 'us_fda_dil_sr90');
    assert.ok(has(x, 'eu_2016_52_a1_other_cs_infant'), 'eu_2016_52_a1_other_cs_infant');
    // Не должны присутствовать общие нормы
    assert.ok(!has(x, 'codex_cxs193_other_cs_group'), 'codex_cxs193_other_cs_group');
    assert.ok(!has(x, 'jp_cs_general_foods'), 'jp_cs_general_foods');
});

test('E09: сыр не «молоко» — нормы общих продуктов Японии/Euratom, молочные не показаны', () => {
    const x = ids('milk_products', 'Сыр');
    // Должны присутствовать общие нормы
    assert.ok(has(x, 'jp_cs_general_foods'), 'jp_cs_general_foods');
    assert.ok(has(x, 'eu_2016_52_a1_other_cs_other'), 'eu_2016_52_a1_other_cs_other');
    // Не должны присутствовать молочные нормы
    assert.ok(!has(x, 'jp_cs_milk'), 'jp_cs_milk');
    assert.ok(!has(x, 'eu_2016_52_a1_other_cs_dairy'), 'eu_2016_52_a1_other_cs_dairy');
});

test('E09: мясо — только общие нормы', () => {
    const x = ids('meat', 'Говядина');
    // Должны присутствовать общие нормы
    assert.ok(has(x, 'jp_cs_general_foods'), 'jp_cs_general_foods');
    assert.ok(has(x, 'codex_cxs193_other_cs_group'), 'codex_cxs193_other_cs_group');
    // Не должны присутствовать специфические нормы (молоко, младенцы)
    assert.ok(!has(x, 'jp_cs_milk'), 'jp_cs_milk');
    assert.ok(!has(x, 'jp_cs_infant_foods'), 'jp_cs_infant_foods');
    assert.ok(!has(x, 'codex_cxs193_infant_cs_group'), 'codex_cxs193_infant_cs_group');
});

test('E09: классы — запись FDA «без отдельной категории для младенцев» общая; порядок классов продукта', () => {
    // FDA: единая норма, без отдельной категории для младенцев -> только 'general'
    assert.deepEqual(foreignClasses('Все пищевые продукты во внутренней торговле и на импорт (единая норма, без отдельной категории для младенцев)'), ['general']);
    
    // Детское питание: сначала 'infant', затем 'general'
    assert.deepEqual(productClasses('baby_food'), ['infant', 'general']);
    
    // Сыр (молочный продукт, но не молоко): только 'general'
    // #FR-85: классы продукта — поле codex записи словаря
    const cls = (n, st) => { const e = productEntry(data.products, n), c = normCodeFor(data.limits_ru, e, st); return classesFor(e, c, c); };
    assert.deepEqual(cls('Сыр', 'fresh'), ['general']);
    
    // Молоко сухое: сначала 'milk', затем 'general'
    assert.deepEqual(cls('Молоко сухое', 'dried'), ['milk', 'general']);
});
