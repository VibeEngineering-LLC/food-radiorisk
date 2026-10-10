// #FR-83 v8 Н-2 (D-023 В4): матрица названий (фикстура) и рыба своего улова/вылова — fish_river (не установлено); покупная «форель» — fish
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './fr81_helpers.js';
import { dietGroupFor } from '../src/calc/diet.js';
const EXTRA = JSON.parse(readFileSync(new URL('./fixtures/fr83_matrix_extra.json', import.meta.url), 'utf8')).names;
const OWN = ['рыба своего улова', 'рыба своего вылова', 'рыба собственного улова', 'лещина', 'орех лещина']; // разбираются отдельными тестами
test('матрица названий: группа рациона совпадает с ожидаемой для всех названий фикстуры (кроме разобранных отдельно)', () => {
    assert.ok(EXTRA.length >= 35);
    for (const [name, want] of EXTRA.filter(([n]) => !OWN.includes(n))) assert.equal((dietGroupFor(data.diet, name, data.products)?.code ?? 'other'), want, name);
});
test('улов и вылов — речная рыба «не установлено» (улов: «улова», вылов: «вылова»)', () => {
    for (const n of ['рыба своего улова', 'рыба собственного улова', 'Рыба своего вылова']) {
        const g = dietGroupFor(data.diet, n, data.products);
        assert.equal(g.code, 'fish_river', n);
        assert.equal(g.status, 'not_established', n);
    }
});
