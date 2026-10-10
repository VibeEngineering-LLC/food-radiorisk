// #FR-83 v8, наблюдения: единица «кг/год» вместо «кг/year» в источниках и отчёте; у грибов вместо внутреннего локатора — документ и таблица
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { buildReport } from '../src/ui/report.js';
import { unitRu } from '../src/ui/ru.js';
const META = { datasets: 0, records: 0, sha: '00000000' };
const M = data.diet.find(r => r.id === 'diet_mu2153_mushrooms');
const input = { ...inputFor('mushrooms', 'Белые грибы', [['Cs-137', 100]]), portionKg: M.value, portionsPerYear: 1, diet: { mode: 'default', id: M.id, group: 'mushrooms' } };
const md = () => buildReport('md', { input, result: computeScenario(data, input) }, META, '2026-10-09T00:00:00.000Z').text;
test('unitRu: pcs переводится на русский', () => {
    assert.equal(unitRu('pcs'), 'шт');
});
test('отчёт по умолчанию: единица «кг/год», слова «year» нет', () => {
    assert.ok(md().includes('кг/год'));
    assert.ok(!/kg\/year|кг\/year/.test(md()));
});
test('грибы: ни предупреждение, ни отчёт не содержат внутреннего локатора, есть МУ и таблица', () => {
    const w = computeScenario(data, input).warnings.find(x => x.includes('7,3')) || '';
    for (const s of [w, md()]) { assert.ok(!/\.md\b|doc_\d/.test(s)); assert.ok(s.includes('табл. 8.6') || s.includes('Табл. 8.6')); }
});
