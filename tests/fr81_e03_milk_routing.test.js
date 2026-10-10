// #FR-81 E03: сыр, сгущённое, сухое молоко и масло относятся к группе milk_products, а не к «молоку» п. 5 Прил. 4
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normCodeFor, dryingFactorFor } from '../src/calc/catalog.js';
import { productEntry } from '../src/calc/products.js';
import { data } from './fr81_helpers.js';

// Вспомогательная функция для получения группы норм
// #FR-85: группа норм — группа строки норматива записи словаря продуктов
const ent = (name) => productEntry(data.products, name);
const grp = (name, state = 'fresh') => normCodeFor(data.limits_ru, ent(name), state);
// Вспомогательная функция для получения ключа категории
const key = (name) => grp(name);

test('E03: сыр, сгущённое, сухое молоко (при состоянии «свежий»), масло сливочное → milk_products', () => {
    // Проверяем, что продукты относятся к группе молочных продуктов
    assert.equal(grp('Сыр'), 'milk_products');
    assert.equal(grp('Молоко сгущённое'), 'milk_products');
    assert.equal(grp('Молоко сухое'), 'milk_products');
    assert.equal(grp('Масло сливочное'), 'milk_products');
});

test('E03: молоко и творог остаются в группе milk; сушёное молоко — milk_products, коэффициент концентрирования при сушке = 5', () => {
    // Свежее молоко и творог остаются в основной группе молока
    assert.equal(grp('Молоко'), 'milk');
    assert.equal(grp('Творог'), 'milk');
    
    // Сушёное молоко переходит в группу молочных продуктов
    assert.equal(grp('Молоко', 'dried'), 'milk_products');
    
    // Проверяем коэффициент концентрирования при сушке
    assert.equal(dryingFactorFor(data.limits_ru, ent('Молоко')).value, 5);
});
