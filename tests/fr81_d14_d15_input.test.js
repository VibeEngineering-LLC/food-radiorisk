// #FR-81 D14/D15: срок питания и рацион — недопустимый ввод даёт ошибку, а не молчаливую 1 или дозу 0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';
import { periodYears } from '../src/calc/lifetime.js';
import { buildInput } from '../src/ui/form.js';

const nuc = [['Cs-137', 100]];

test('D14: срок 0, меньше 1 и пустой — ошибка с сообщением', () => {
    for (const years of [0, 0.5, null, NaN]) {
        const r = run(null, 'молоко', nuc, { years });
        assert.equal(r.ok, false, `Ожидалась ошибка для years=${String(years)}`);
        assert.match(r.errors[0], /Срок питания: укажите число лет/);
    }
});

test('D14: единая функция периода — год, дробный срок, режим «с N до M»', () => {
    assert.equal(periodYears({ years: 1 }), 1);
    assert.equal(periodYears({ years: 2.5 }), 2.5);
    assert.equal(periodYears({ years: 0 }), null);
    assert.equal(periodYears({ years: 1, lifetime: { fromAge: 20, toAge: 70 } }), 50);
    assert.equal(buildInput({ years: '', nuclides: [] }).years, null);
});

test('D15: пустая масса порции или частота — ошибка ввода, не доза 0', () => {
    assert.match(run(null, 'молоко', nuc, { portionKg: null }).errors.join(' '), /Рацион: укажите массу порции/);
    assert.match(run(null, 'молоко', nuc, { portionsPerYear: null }).errors.join(' '), /Рацион: укажите, как часто/);
    assert.equal(run(null, 'молоко', nuc, {}).ok, true);
});
