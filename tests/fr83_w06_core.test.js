// #FR-83 W06: ядро — потребление по умолчанию: предупреждение, провенанс, сверка с данными, ребёнок в обход формы, причина вместо «укажите массу»
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { T, fill } from '../src/ui/texts_v.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const rec = (id) => data.diet.find(r => r.id === id);
const P = rec('diet_bal2025_potato');
const dietBlock = { mode: 'default', id: P.id, group: 'potato', series: P.series, value: P.value, unit: P.unit, year: P.year };
const inp = (name = 'Картофель', over = {}, nuc = [['Cs-137', 100]]) => ({ ...inputFor('vegetables', name, nuc), portionKg: P.value, portionsPerYear: 1, diet: dietBlock, ...over });
const own = (over = {}) => inp('Картофель', { diet: { mode: 'own' }, ...over });
const NOT_SET = { portionKg: null, portionsPerYear: null, diet: { mode: 'default', reason: 'group', status: 'not_established', group: 'berries_wild', missing: null } };

test('доза при умолчании = доза при ручном вводе той же массы (отн. расхождение до 1e-12)', () => {
    const a = computeScenario(data, inp());
    const b = computeScenario(data, own());
    assert.ok(a.ok);
    assert.ok(b.ok);
    assert.ok(Math.abs(a.totals.doseSvPerYear - b.totals.doseSvPerYear) <= 1e-12 * b.totals.doseSvPerYear);
    assert.strictEqual(b.diet, null);
});

test('предупреждение: умолчание названо в warnings, при вводе «знаю» предупреждения нет', () => {
    const prefix = T.DIET_WARN.split('{')[0];
    const a = computeScenario(data, inp());
    const b = computeScenario(data, own());
    assert.ok(a.warnings.some(w => w.startsWith(prefix) && w.includes(P.loc)));
    assert.ok(!b.warnings.some(w => w.startsWith(prefix)));
});

test('провенанс: шаг «рацион» первым в каждой строке нуклида', () => {
    const a = computeScenario(data, inp('Картофель', {}, [['Cs-137', 100], ['Sr-90', 50]]));
    const b = computeScenario(data, own('Картофель', {}, [['Cs-137', 100], ['Sr-90', 50]]));
    
    assert.strictEqual(a.rows.length, 2);
    for (const row of a.rows) {
        assert.strictEqual(row.provenance[0].step, 'рацион');
        assert.strictEqual(row.provenance[0].id, P.id);
    }
    assert.strictEqual(a.diet.id, P.id);

    for (const row of b.rows) {
        assert.ok(!row.provenance.some(p => p.step === 'рацион'));
    }
});

test('несовпадение массы с данными — ошибка', () => {
    const i = inp();
    i.portionKg = i.portionKg * 2;
    const a = computeScenario(data, i);
    assert.strictEqual(a.ok, false);
    assert.ok(a.errors.includes(T.DIET_MISMATCH));

    const b = computeScenario(data, inp('Картофель', { diet: { ...dietBlock, id: 'diet_no_such' } }));
    assert.ok(b.errors.includes(fill(T.DIET_NO_REC, { id: 'diet_no_such' })));
});

test('ребёнок в обход формы — ошибка T.DIET_CHILD', () => {
    const a = computeScenario(data, inp('Картофель', { age: '10y' }));
    assert.strictEqual(a.ok, false);
    assert.ok(a.errors.includes(T.DIET_CHILD));

    const b = computeScenario(data, inp('Картофель', { lifetime: { fromAge: 5, toAge: 70 } }));
    assert.strictEqual(b.ok, false);
    assert.ok(b.errors.includes(T.DIET_CHILD));

    const c17 = computeScenario(data, inp('Картофель', { lifetime: { fromAge: 17, toAge: 70 } }));
    assert.ok(c17.errors.includes(T.DIET_CHILD)); // В6: до 18 лет умолчания нет

    const c = computeScenario(data, inp('Картофель', { lifetime: { fromAge: 18, toAge: 70 } }));
    assert.ok(!c.errors.includes(T.DIET_CHILD));
});

test('сушёный и готовое блюдо в обход формы — ошибка T.DIET_STATE', () => {
    const a = computeScenario(data, inp('Картофель', { product: { name: 'Картофель', state: 'dried' } }));
    assert.ok(a.errors.includes(T.DIET_STATE));

    const b = computeScenario(data, inp('Картофель', { product: { name: 'Картофель', state: 'cooked' } }));
    assert.ok(b.errors.includes(T.DIET_STATE));

    const c = computeScenario(data, inp());
    assert.ok(!c.errors.includes(T.DIET_STATE));
});

test('нет значения: причина вместо «укажите массу порции»', () => {
    const r = computeScenario(data, inp('черника лесная', NOT_SET));
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.includes(T.DIET_NOT_SET));
    assert.ok(!r.errors.some(e => e.includes('укажите массу порции')));
});
