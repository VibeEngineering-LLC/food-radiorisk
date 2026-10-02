import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIFETIME_END_AGE, AGE_BANDS, bandYears, lifetimeDose } from '../src/calc/lifetime.js';
const E = { '3m': 2.1e-8, '1y': 1.2e-8, '5y': 9.6e-9, '10y': 1.0e-8, '15y': 1.3e-8, adult: 1.3e-8 };
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('LIFETIME_END_AGE равен 70; AGE_BANDS.map(b => b.age) deepEqual ["3m","1y","5y","10y","15y","adult"]', () => {
    assert.strictEqual(LIFETIME_END_AGE, 70);
    assert.deepStrictEqual(AGE_BANDS.map(b => b.age), ['3m', '1y', '5y', '10y', '15y', 'adult']);
});

test('bandYears(0, 70) deepEqual [{age:"3m",years:1},{age:"1y",years:1},{age:"5y",years:5},{age:"10y",years:5},{age:"15y",years:5},{age:"adult",years:53}]', () => {
    assert.deepStrictEqual(bandYears(0, 70), [
        { age: '3m', years: 1 },
        { age: '1y', years: 1 },
        { age: '5y', years: 5 },
        { age: '10y', years: 5 },
        { age: '15y', years: 5 },
        { age: 'adult', years: 53 }
    ]);
});

test('bandYears(10, 70) deepEqual [{age:"10y",years:2},{age:"15y",years:5},{age:"adult",years:53}]', () => {
    assert.deepStrictEqual(bandYears(10, 70), [
        { age: '10y', years: 2 },
        { age: '15y', years: 5 },
        { age: 'adult', years: 53 }
    ]);
});

test('bandYears(30, 40) deepEqual [{age:"adult",years:10}]; bandYears(0.5, 1.5) deepEqual [{age:"3m",years:0.5},{age:"1y",years:0.5}]', () => {
    assert.deepStrictEqual(bandYears(30, 40), [{ age: 'adult', years: 10 }]);
    assert.deepStrictEqual(bandYears(0.5, 1.5), [
        { age: '3m', years: 0.5 },
        { age: '1y', years: 0.5 }
    ]);
});

test('Сумма лет bandYears(s, 70) равна 70 - s для s в [0, 0.5, 1, 2, 6.5, 12, 16.9, 17, 40, 69]', () => {
    const starts = [0, 0.5, 1, 2, 6.5, 12, 16.9, 17, 40, 69];
    for (const s of starts) {
        const bands = bandYears(s, 70);
        const sumYears = bands.reduce((acc, b) => acc + b.years, 0);
        near(sumYears, 70 - s);
    }
});

test('lifetimeDose(100, 0, 70, E): years=70, intakeBq=7000, doseSv равен независимой сумме, bands.length=6, bands[5] корректен', () => {
    const result = lifetimeDose(100, 0, 70, E);
    assert.strictEqual(result.years, 70);
    assert.strictEqual(result.intakeBq, 7000);
    
    const expectedDose = 100 * (
        1 * 2.1e-8 + 
        1 * 1.2e-8 + 
        5 * 9.6e-9 + 
        5 * 1.0e-8 + 
        5 * 1.3e-8 + 
        53 * 1.3e-8
    );
    near(result.doseSv, expectedDose);
    
    assert.strictEqual(result.bands.length, 6);
    
    const lastBand = result.bands[5];
    assert.deepStrictEqual(lastBand.age, 'adult');
    assert.strictEqual(lastBand.years, 53);
    assert.strictEqual(lastBand.eSvPerBq, 1.3e-8);
    near(lastBand.doseSv, 100 * 53 * 1.3e-8);
});

test('Начало с взрослого возраста: doseSv равен расчету; первые два года выше взрослого, за 70 лет ниже за 70 лет', () => {
    const adultOnlyDose = lifetimeDose(100, 30, 40, E).doseSv;
    near(adultOnlyDose, 100 * 10 * 1.3e-8);
    
    // первые два года коэффициенты выше взрослого; за всю жизнь при этих E сумма ниже «как взрослый» (5 и 10 лет — ниже)
    assert.ok(lifetimeDose(100, 0, 2, E).doseSv > 100 * 2 * E.adult);
    assert.ok(lifetimeDose(100, 0, 70, E).doseSv < 100 * 70 * E.adult);
});

test('Нулевое поступление дает doseSv=0 и intakeBq=0', () => {
    const result = lifetimeDose(0, 0, 70, E);
    assert.strictEqual(result.doseSv, 0);
    assert.strictEqual(result.intakeBq, 0);
});

test('Ошибки: bandYears(NaN, 70), bandYears(-1, 70), bandYears(70, 70), bandYears(0, Infinity), lifetimeDose с невалидными аргументами', () => {
    assert.throws(() => bandYears(NaN, 70), RangeError);
    assert.throws(() => bandYears(-1, 70), RangeError);
    assert.throws(() => bandYears(70, 70), RangeError);
    assert.throws(() => bandYears(0, Infinity), RangeError);
    
    assert.throws(() => lifetimeDose(-1, 0, 70, E), RangeError);
    assert.throws(() => lifetimeDose(NaN, 0, 70, E), RangeError);
    
    assert.throws(() => lifetimeDose(100, 0, 70, { ...E, '5y': undefined }), /5y/);
    assert.throws(() => lifetimeDose(100, 30, 40, { '3m': 1e-8 }), /adult/);
    
    // Не должно выбрасывать ошибку, если коэффициент для взрослого есть, а другие не нужны
    assert.doesNotThrow(() => lifetimeDose(100, 30, 40, { adult: 1.3e-8 }));
});

test('Аргументы не мутируются: JSON.stringify(E) одинаков до и после lifetimeDose', () => {
    const before = JSON.stringify(E);
    lifetimeDose(100, 0, 70, E);
    const after = JSON.stringify(E);
    assert.strictEqual(before, after);
});
