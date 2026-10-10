// #FR-83 W05: вход ядра из формы — масса из данных, режимы, пустые поля по умолчанию, обратное преобразование
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';

const ch = listChoices(data);

// Вспомогательная функция для создания состояния формы
const mk = (product, over = {}) => {
    let r = S.setField(S.setField(S.initialRaw(ch), ch, 'measuredForm', 'fresh'), ch, 'product', product);
    for (const [k, v] of Object.entries(over)) r = S.setField(r, ch, k, v);
    return r;
};

test('по умолчанию: масса «Картофель» = значение записи из данных', () => {
    const rec = data.diet.find(r => r.id === 'diet_bal2025_potato');
    const i = S.toInput(mk('Картофель'), ch);
    assert.equal(i.portionKg * i.portionsPerYear, rec.value);
    assert.equal(i.portionsPerYear, 1);
    assert.equal(i.diet.mode, 'default');
    assert.equal(i.diet.id, rec.id);
    assert.equal(i.diet.group, 'potato');
    assert.equal(i.diet.year, rec.year);
});

test('«знаю»: прежний ввод, diet = { mode: \'own\' }', () => {
    const raw = mk('Картофель', {
        dietMode: 'own',
        portionG: '50',
        timesPerDay: '2',
        daysPerWeek: '3',
        weeksPerMonth: '4',
        monthsPerYear: '3'
    });
    const i = S.toInput(raw, ch);
    assert.equal(i.portionKg, 0.05);
    assert.equal(i.portionsPerYear, 72);
    assert.deepEqual(i.diet, { mode: 'own' });
});

test('нет значения: черника — масса пустая, причина group', () => {
    const i = S.toInput(mk('черника лесная'), ch);
    assert.equal(i.portionKg, null);
    assert.equal(i.portionsPerYear, null);
    assert.equal(i.diet.mode, 'default');
    assert.equal(i.diet.reason, 'group');
});

test('высокое: говядина — запись 10-й децильной группы', () => {
    const iMeat = S.toInput(mk('Говядина', { dietMode: 'high' }), ch);
    assert.equal(iMeat.diet.id, 'diet_d10_2025_meat');
    assert.equal(iMeat.diet.series, 'high_d10');
});

test('начальная форма: режим «по умолчанию», поля ручного ввода пусты', () => {
    const r = S.initialRaw(ch);
    assert.equal(r.dietMode, 'default');
    assert.deepEqual([r.portionG, r.timesPerDay, r.daysPerWeek, r.weeksPerMonth, r.monthsPerYear], ['', '', '', '', '']);
});

test('обратное преобразование: режим сохраняется, поля «знаю» при умолчании пусты', () => {
    const r1 = S.rawFromInput(S.toInput(mk('Картофель'), ch), ch);
    assert.equal(r1.dietMode, 'default');
    assert.equal(r1.portionG, '');
    assert.equal(r1.monthsPerYear, '');

    const r2 = S.rawFromInput(S.toInput(mk('Картофель', {
        dietMode: 'own',
        portionG: '50',
        timesPerDay: '2',
        daysPerWeek: '3',
        weeksPerMonth: '4',
        monthsPerYear: '3'
    }), ch), ch);
    assert.equal(r2.dietMode, 'own');
    assert.equal(r2.portionG, '50');
});

test('подсказка рациона: масса из данных за срок питания', () => {
    const rec = data.diet.find(r => r.id === 'diet_bal2025_potato');
    const h = S.hints(mk('Картофель', { years: '5' }), ch).diet;
    assert.match(h, new RegExp(String(rec.value)));
    assert.match(h, /за 5 г\./);
});
