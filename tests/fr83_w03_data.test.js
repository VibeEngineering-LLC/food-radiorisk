// #FR-83 W03: набор diet — статусы 23 продуктов, золотые значения баланса, провенанс, ключи категорий
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';

const groups = data.diet.filter(r => r.kind === 'group');
const values = data.diet.filter(r => r.kind === 'value');

test('статусы 24 групп: 10 умолчаний, 9 «не установлено», 5 «требуется источник»', () => {
    const EXPECTED = {
        mushrooms: 'default',
        milk: 'default',
        potato: 'default',
        vegetables: 'default',
        legumes: 'default',
        cereals: 'default',
        fruit: 'default',
        meat: 'default',
        fish: 'default',
        oil: 'default',
        fish_river: 'not_established',
        lard: 'not_established',
        baby: 'not_established',
        berries_wild: 'not_established',
        game: 'not_established',
        water: 'not_established',
        herbal: 'not_established',
        greens_wild: 'not_established', // #FR-85 v15 (D-026 п. 4): дикорастущая зелень
        other: 'not_established',
        meat_products: 'source_required',
        mayonnaise: 'source_required',
        eggs: 'source_required',
        milk_concentrates: 'source_required',
        bread: 'source_required'
    };

    assert.equal(groups.length, 24, 'Ожидалось 24 группы');

    const groupCodes = groups.map(g => g.code).sort();
    const expectedKeys = Object.keys(EXPECTED).sort();
    assert.deepEqual(groupCodes, expectedKeys, 'Список кодов групп не совпадает с ожидаемым');

    let countDefault = 0;
    let countNotEstablished = 0;
    let countSourceRequired = 0;

    for (const g of groups) {
        const expectedStatus = EXPECTED[g.code];
        assert.equal(g.status, expectedStatus, `Статус для ${g.code} должен быть ${expectedStatus}, получен ${g.status}`);

        if (g.status === 'default') countDefault++;
        else if (g.status === 'not_established') countNotEstablished++;
        else if (g.status === 'source_required') countSourceRequired++;
    }

    assert.equal(countDefault, 10, 'Количество статусов default должно быть 10');
    assert.equal(countNotEstablished, 9, 'Количество статусов not_established должно быть 9');
    assert.equal(countSourceRequired, 5, 'Количество статусов source_required должно быть 5');
});

test('золотые значения: баланс Росстата 2025 и ориентир для грибов', () => {
    const GOLD = {
        diet_bal2025_cereals: 112,
        diet_bal2025_potato: 85,
        diet_bal2025_veg: 109,
        diet_bal2025_fruit: 67,
        diet_bal2025_meat: 83,
        diet_bal2025_milk: 253,
        diet_bal2025_fish: 28,
        diet_bal2025_oil: 13.9,
        diet_bal2025_eggs: 299,
        diet_mu2153_mushrooms: 7.3
    };

    for (const [id, expectedValue] of Object.entries(GOLD)) {
        const rec = values.find(v => v.id === id);
        assert.ok(rec, `Запись с id ${id} не найдена`);
        assert.equal(rec.value, expectedValue, `Значение для ${id} должно быть ${expectedValue}`);
    }
});

test('провенанс: у каждого значения есть источник, место, цитата и уровень ✅ или 📗, ⚠️ в наборе нет', () => {
    for (const rec of values) {
        assert.ok(typeof rec.source === 'string' && rec.source.length > 0, `У записи ${rec.id} отсутствует source`);
        assert.ok(typeof rec.loc === 'string' && rec.loc.length > 0, `У записи ${rec.id} отсутствует loc`);
        assert.ok(typeof rec.quote === 'string' && rec.quote.length > 0, `У записи ${rec.id} отсутствует quote`);
        assert.ok(['✅', '📗'].includes(rec.level), `У записи ${rec.id} недопустимый уровень: ${rec.level}`);
        assert.ok(rec.value > 0, `У записи ${rec.id} значение должно быть > 0`);

        if (rec.series === 'balance' || rec.series === 'high_d10') {
            assert.ok(Number.isInteger(rec.year), `У записи ${rec.id} year должен быть целым числом`);
            assert.equal(rec.year, 2025, `У записи ${rec.id} year должен быть 2025`);
        }

        if (rec.series === 'norm614') {
            assert.equal(rec.level, '📗', `У записи ${rec.id} с серией norm614 уровень должен быть 📗`);
        }
    }
});

// #FR-85 (D-024): группа рациона продукта — поле diet.group словаря products.yaml; правил распознавания по основам (match, priority, base_words) в diet.yaml нет
test('группы рациона без правил по основам; каждая группа словаря продуктов существует в diet.yaml', () => {
    for (const g of groups) {
        for (const k of ['match', 'priority', 'base_words']) assert.ok(!(k in g), `${g.code}: поле ${k} — механизм основ удалён (#FR-85)`);
    }
    const codes = new Set(groups.map(g => g.code));
    const used = data.products.filter(r => r.kind === 'product' && r.diet.group !== null);
    assert.ok(used.length > 300, String(used.length));
    for (const r of used) assert.ok(codes.has(r.diet.group) && r.diet.group !== 'other', `${r.id}: ${r.diet.group}`);
});
