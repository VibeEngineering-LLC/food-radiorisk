// #FR-81 E05: автоподбор категории и группы норм по названию продукта
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

test('E05: «ржаной хлеб», «хлеб ржаной», «овсяный хлеб» — хлеб (п. 14), а не мука/крупы (п. 15)', () => {
    // Проверяем, что различные варианты названия хлеба относятся к категории хлеба
    assert.equal(key('Ржаной хлеб'), 'bread');
    assert.equal(key('Хлеб ржаной'), 'bread');
    assert.equal(key('Овсяный хлеб'), null); // #FR-85 v11: «овсяный» не покрыт словарём — «частично», без молчаливого принятия
    assert.equal(normCodeFor(data.limits_ru, productEntry(data.products, 'Овсяный хлеб', 'p_khleb'), 'fresh'), 'bread'); // после подтверждения — хлеб
    
    // Проверяем группы норм для хлеба
    assert.equal(grp('Ржаной хлеб'), 'bread');
    assert.equal(grp('Хлеб ржаной'), 'bread');
    
    // Ржаная мука относится к крупам, а не к хлебу
    assert.equal(key('Мука ржаная'), 'cereals');
});

test('E05: названия, которые раньше не распознавались', () => {
    // Таблица тестовых данных: название продукта и ожидаемый ключ категории
    const testCases = [
        ['Рис', 'cereals'],
        ['Макароны', 'cereals'],
        ['Пшено', 'cereals'],
        ['Лук репчатый', 'vegetables'],
        ['Вобла', 'fish'],
        ['Лосось', 'fish'],
        ['Детская молочная смесь', 'baby_food'],
        ['Масло подсолнечное', 'fats_oils'],
        ['Мясо лося', 'meat_game'],
        ['Маслята', 'mushrooms_fresh']
    ];
    
    // Проверяем каждое название
    for (const [name, expectedKey] of testCases) {
        assert.equal(key(name), expectedKey, `Неверная категория для "${name}"`);
    }
});

test('E05: группы норм для новых категорий', () => {
    // Проверяем группы норм для различных продуктов
    assert.equal(grp('Детская молочная смесь'), 'baby_food');
    assert.equal(grp('Масло подсолнечное'), 'fats_oils');
    assert.equal(grp('Лосось'), 'fish');
    assert.equal(grp('Вобла', 'dried'), 'fish_dried');
    assert.equal(grp('Рис'), 'cereals');
});

test('E05: садовые ягоды не относятся к дикорастущим (п. 16 только дикорастущие)', () => {
    // Садовые ягоды не должны распознаваться как дикорастущие
    assert.equal(key('Клубника садовая'), null);
    assert.equal(key('Малина садовая'), null);
    
    // Обычные названия ягод относятся к категории ягод
    // #FR-85 v11 (решение оркестратора): без уточнения — выбор садовая/дикорастущая, норматива нет до выбора
    assert.equal(key('Клубника'), null);
    assert.equal(key('Черника'), 'berries_wild'); // v13, С8: дикорастущая без вопроса
    assert.equal(key('Клубника дикорастущая'), 'berries_wild');
    assert.equal(key('Черника лесная'), 'berries_wild');
    
    // Мёд не относится к ягодам
    assert.equal(key('Мёд'), null);
});
