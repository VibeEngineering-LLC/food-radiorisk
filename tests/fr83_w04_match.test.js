// #FR-83 W04: распознавание группы рациона и выбор значения (35 боевых названий, ребёнок, режим с возраста a, состояние, высокое)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { dietGroupFor, dietDefaultFor } from '../src/calc/diet.js';

const pick = (name, over = {}) => dietDefaultFor(data.diet, { productName: name, state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products: data.products, ...over });

test('таблица боевых названий: группа и статус (35 образцов)', () => {
    const SAMPLES = [
        ['Молоко','milk','default'],
        ['Молоко сухое','milk_concentrates','source_required'],
        ['Творог','milk_concentrates','source_required'],
        ['Сыр','milk_concentrates','source_required'],
        ['Говядина','meat','default'],
        ['Свинина','meat','default'],
        ['Картофель','potato','default'],
        ['Морковь','vegetables','default'],
        ['Капуста','vegetables','default'],
        ['Свёкла','vegetables','default'],
        ['Хлеб','bread','source_required'],
        ['Мука пшеничная','cereals','default'],
        ['Крупа гречневая','cereals','default'],
        ['Рыба речная','fish_river','not_established'],
        ['Вода питьевая бутилированная','water','not_established'], // #FR-85 v15: «вода питьевая» без уточнения — вопрос (ch_voda)
        ['Чай травяной','herbal','not_established'],
        ['черника лесная','berries_wild','not_established'], // #FR-85 v11: «черника» без уточнения — выбор
        ['Белые грибы','mushrooms','default'],
        ['Лосятина','game','not_established'],
        ['Яблоки','fruit','default'],
        ['Малина садовая','fruit','default'],
        ['малина лесная','berries_wild','not_established'], // #FR-85 v11: «малина» без уточнения — выбор
        ['Колбаса варёная','meat_products','source_required'],
        ['Масло подсолнечное','oil','default'],
        ['Масло сливочное','milk_concentrates','source_required'],
        ['Майонез','mayonnaise','source_required'],
        ['Сало','lard','not_established'],
        ['Яйца куриные','eggs','source_required'],
        ['Горох','legumes','default'],
        ['Арбуз','vegetables','default'],
        ['Сёмга','fish','default'],
        ['Окунь морской','fish','default'],
        ['Окунь речной','fish_river','not_established'], // #FR-85 v11 (A 4.2): «окунь» без уточнения — выбор речной / морской
        ['Детское питание','baby','not_established'],
        ['сахар','other','not_established']
    ];

    assert.equal(SAMPLES.length, 35);

    for (const [name, groupCode, status] of SAMPLES) {
        const r = pick(name);
        assert.equal(r.group?.code ?? 'other', groupCode, `Группа для "${name}" должна быть ${groupCode}`); // #FR-85: null — запись словаря без группы рациона
        assert.equal(r.status, status, `Статус для "${name}" должен быть ${status}`);
    }
    // справочный ряд «вся рыба по России» приходит к речной рыбе из данных (группа распознана — тот же тест)
    assert.equal(pick('Рыба речная').info.group, 'fish');
});

test('ребёнок: умолчания нет для всех детских возрастных групп', () => {
    const ages = ['3m','1y','1-2y','5y','10y','12-17y','15y'];
    for (const age of ages) {
        const r = pick('Картофель', { age });
        assert.equal(r.status, 'not_established', `Для возраста ${age} статус должен быть not_established`);
        assert.equal(r.reason, 'child', `Для возраста ${age} причина должна быть child`);
        assert.equal(r.rec, null, `Для возраста ${age} запись должна быть null`);
    }
});

test('режим «с возраста a до b»: до 18 лет (включая 17) умолчания нет, с 18 — есть (D-023 В6)', () => {
    const r1 = pick('Картофель', { lifetime: { fromAge: 5, toAge: 70 } });
    assert.equal(r1.reason, 'child', 'Для fromAge 5 причина должна быть child');

    const r2 = pick('Картофель', { lifetime: { fromAge: 16, toAge: 70 } });
    assert.equal(r2.reason, 'child', 'Для fromAge 16 причина должна быть child');

    const r17 = pick('Картофель', { lifetime: { fromAge: 17, toAge: 70 } });
    assert.equal(r17.reason, 'child', 'Для fromAge 17 причина должна быть child (В6)');

    const r3 = pick('Картофель', { lifetime: { fromAge: 18, toAge: 70 } });
    assert.equal(r3.status, 'default', 'Для fromAge 18 статус должен быть default');

    const r4 = pick('Картофель', { lifetime: { fromAge: null, toAge: 70 } });
    assert.equal(r4.reason, 'child', 'Для fromAge null причина должна быть child');
});

test('состояние: сушёный продукт и готовое блюдо — умолчания нет, свежий и пустое состояние — есть', () => {
    const rDried = pick('Картофель', { state: 'dried' });
    assert.equal(rDried.status, 'not_established', 'Для state dried статус должен быть not_established');
    assert.equal(rDried.reason, 'state', 'Для state dried причина должна быть state');

    const rCooked = pick('Картофель', { state: 'cooked' });
    assert.equal(rCooked.status, 'not_established', 'Для state cooked статус должен быть not_established');
    assert.equal(rCooked.reason, 'state', 'Для state cooked причина должна быть state');

    const rFresh = pick('Картофель', { state: 'fresh' });
    assert.equal(rFresh.status, 'default', 'Для state fresh статус должен быть default');

    const rEmpty = pick('Картофель', { state: '' });
    assert.equal(rEmpty.status, 'default', 'Для пустого state статус должен быть default');
});

test('высокое потребление: картофель и грибы — не установлено (дециль ниже баланса или ряда нет), мясо — 10-я децильная группа', () => {
    const rPotato = pick('Картофель', { mode: 'high' });
    assert.equal(rPotato.status, 'not_established', 'Для картофеля в режиме high статус должен быть not_established');
    assert.equal(rPotato.reason, 'high_not_set', 'Для картофеля в режиме high причина должна быть high_not_set');

    const rMushrooms = pick('Белые грибы', { mode: 'high' });
    assert.equal(rMushrooms.status, 'not_established', 'Для грибов в режиме high статус должен быть not_established');
    assert.equal(rMushrooms.reason, 'high_no_series', 'Для грибов в режиме high причина должна быть high_no_series (ряда дециля нет)');

    const m = pick('Говядина', { mode: 'high' });
    assert.equal(m.status, 'default', 'Для говядины в режиме high статус должен быть default');
    assert.equal(m.rec.series, 'high_d10', 'Для говядины в режиме high серия должна быть high_d10');
    assert.ok(m.rec.value > m.base.value, 'Значение high_d10 должно быть больше base.value');

    const mBase = pick('Говядина');
    assert.equal(mBase.rec.series, 'balance', 'Для говядины в режиме default серия должна быть balance');
    assert.equal(mBase.rec.id, m.base.id, 'ID записи base должно совпадать');
});

test('справка: норма № 614 и опорный ряд приходят из данных', () => {
    const rPotato = pick('Картофель');
    assert.equal(rPotato.ref614.series, 'norm614', 'Для картофеля ref614.series должна быть norm614');

    const rMushrooms = pick('Белые грибы');
    assert.equal(rMushrooms.rec.series, 'method_estimate', 'Для грибов rec.series должна быть method_estimate');
    assert.equal(rMushrooms.ref614, null, 'Для грибов ref614 должна быть null');

    const rEggs = pick('Яйца куриные');
    assert.equal(rEggs.info.unit, 'pcs/year', 'Для яиц info.unit должна быть pcs/year');
});
