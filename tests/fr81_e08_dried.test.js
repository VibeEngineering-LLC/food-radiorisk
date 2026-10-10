// #FR-81 E08: зарубежные нормы — для продукта в готовом (восстановленном) виде: активность сухого продукта делится на коэффициент концентрирования
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const dry = (over) => run('mushrooms_dried', 'грибы', [['Cs-137', 2000]], { product: { name: 'грибы', state: 'dried' }, ...over });
const ratio = (r, id) => r.limits.foreign.find(f => f.id === id).ratio;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const WARN = /готовом \(восстановленном\)/;

test('E08: сушёные грибы 2000 Бк/кг, K = 5: Codex 0,4 (не 2), Япония 4 (не 20)', () => {
    const r = dry({ dryingFactor: 5 });
    close(ratio(r, 'codex_cxs193_other_cs_group'), 0.4);
    close(ratio(r, 'jp_cs_general_foods'), 4);
    const jpEntry = r.limits.foreign.find(f => f.id === 'jp_cs_general_foods');
    assert.equal(jpEntry.reconstitution, 5);
    assert.ok(!r.warnings.some(w => WARN.test(w)));
});

test('E08: K не задан — пересчёта нет, но есть предупреждение', () => {
    const r = dry({ dryingFactor: null });
    close(ratio(r, 'codex_cxs193_other_cs_group'), 2);
    assert.ok(r.warnings.some(w => WARN.test(w)));
});

test('E08: свежий продукт не пересчитывается и предупреждения нет', () => {
    const r = run('mushrooms_fresh', 'грибы', [['Cs-137', 2000]]);
    close(ratio(r, 'codex_cxs193_other_cs_group'), 2);
    assert.ok(!r.warnings.some(w => WARN.test(w)));
});
