// #FR-81 D20: пределы 1 и 70 мЗв и порог пренебрежимой дозы 10 мкЗв — из набора risk, на экране рядом с долей предела
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { data, run, runWith } from './fr81_helpers.js';

// Вспомогательная функция для изменения значения записи в наборе risk
const bump = (id, v) => ({ ...data, risk: data.risk.map(r => r.id === id ? { ...r, value: v } : r) });

// Стандартный набор изотопов и активности для тестов
const nuc = [['Cs-137', 1000]];

// Функция для сравнения чисел с высокой точностью
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('D20/V02: порог 10 мкЗв/год берётся из записи osporb2010_optimization_negligible (ОСПОРБ-99/2010, принцип оптимизации)', () => {
    const t = run(null, 'молоко', nuc).totals;
    assert.strictEqual(t.optimNegligibleSv, 1e-5);
    assert.match(t.optimNegligibleLoc, /оптимизации/);
    const t2 = runWith(bump('osporb2010_optimization_negligible', 20), null, 'молоко', nuc).totals;
    assert.strictEqual(t2.optimNegligibleSv, 2e-5);
    assert.ok(t2.doseMaxYearTech < t2.optimNegligibleSv && t.doseMaxYearTech > t.optimNegligibleSv);
});

test('D20: предел 1 мЗв/год и 70 мЗв за жизнь — из записей набора', () => {
    const t = run(null, 'молоко', nuc).totals;
    
    // Проверяем расчет доли от годового предела (1 мЗв = 1e-3 Зв)
    // budgetShare1mSvAvg5 = techDoseSvPerYear / 1e-3
    near(t.budgetShare1mSvAvg5, t.techDoseSvPerYear / 5 / 1e-3); // срок 1 год: Ē₅ = E / 5
    
    // Меняем годовой предел на 2 мЗв. Доля должна уменьшиться вдвое.
    // budgetShare = dose / limit. Если limit * 2, то share / 2.
    // t2.budgetShare * 2 === t.budgetShare
    near(runWith(bump('nrb2009_t31_dose_limit_pop', 2), null, 'молоко', nuc).totals.budgetShare1mSvAvg5 * 2, t.budgetShare1mSvAvg5);
    
    // Меняем предел за жизнь на 140 мЗв. Доля должна уменьшиться вдвое.
    // lifeShare = dose / lifetimeLimit. Если limit * 2, то share / 2.
    // t2.lifeShare * 2 === t.lifeShare
    near(runWith(bump('nrb2009_p314_lifetime_dose_pop', 140), null, 'молоко', nuc).totals.lifeShare70mSv * 2, t.lifeShare70mSv);
});
