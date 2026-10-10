// #FR-83 v8 Н-1 (D-023 В1): изделие группы, не совпадающее с основой учёта (маргарин, чипсы), — подпись «оценка сверху»; сама основа — без неё
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { dietDefaultFor, dietScopeText } from '../src/calc/diet.js';
import { computeScenario } from '../src/calc/model.js';
import { T } from '../src/ui/texts_v.js';
const pick = (name, mode = 'default') => dietDefaultFor(data.diet, { productName: name, state: 'fresh', age: 'adult', lifetime: null, mode, products: data.products });
const SCOPE = T.DIET_SCOPE.split('{')[0];
test('маргарин, спред, чипсы и виды масел — подпись «оценка сверху»; картофель и «Масло растительное» — без неё', () => { // v14 п. 5 (D-025): виды масел (подсолнечное, оливковое…) получают подпись
    for (const n of ['маргарин', 'Спред сливочно-растительный', 'картофельные чипсы', 'Чипсы картофельные', 'картофельное пюре', 'масло подсолнечное', 'Масло оливковое']) { // #FR-85: «масло» без уточнения словарём не распознаётся — ручной выбор группы, не «растительное»
        assert.ok(dietScopeText(pick(n).group).startsWith(SCOPE), n);
    }
    for (const n of ['Картофель', 'картошка жареная', 'Масло растительное']) {
        assert.equal(dietScopeText(pick(n).group), '', n);
    }
});
test('ядро: предупреждение для маргарина и подсолнечного масла содержит подпись, для «Масла растительного» — нет', () => {
    const run = (n) => { const p = pick(n); return computeScenario(data, { ...inputFor('fats', n, [['Cs-137', 100]]), portionKg: p.rec.value, portionsPerYear: 1, diet: { mode: 'default', id: p.rec.id, group: p.group.code } }); };
    assert.ok(run('маргарин').warnings.some(w => w.includes(SCOPE.trim())));
    assert.ok(run('масло подсолнечное').warnings.some(w => w.includes(SCOPE.trim())));
    assert.ok(!run('масло растительное').warnings.some(w => w.includes(SCOPE.trim())));
});
