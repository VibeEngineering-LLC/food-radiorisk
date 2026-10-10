// #FR-81 E07: групповые зарубежные нормы — активности нуклидов группы складываются, одна строка на запись нормы
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const byId = (r, id) => r.limits.foreign.filter(f => f.id === id);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('E07: мясо, Cs-134 = 600 и Cs-137 = 600 Бк/кг — одна строка на норму, A/H по сумме', () => {
    const r = run('meat', 'Говядина', [['Cs-134', 600], ['Cs-137', 600]]);

    const cases = [
        ['codex_cxs193_other_cs_group', 1.2],
        ['us_fda_dil_cs134_137', 1.0],
        ['eu_2016_52_a1_other_cs_other', 0.96],
        ['jp_cs_general_foods', 12]
    ];

    for (const [id, expectedRatio] of cases) {
        const entries = byId(r, id);
        assert.equal(entries.length, 1, `Ожидалась одна запись для ${id}`);
        close(entries[0].ratio, expectedRatio);
    }

    const codexEntry = byId(r, 'codex_cxs193_other_cs_group')[0];
    assert.deepEqual(codexEntry.nuclides.sort(), ['Cs-134', 'Cs-137']);
    close(codexEntry.activity, 1200);
});

test('E07: Cs и Sr — разные группы Codex: Sr-90 сравнивается со своей нормой 100, а не складывается с цезием', () => {
    const r = run('meat', 'Говядина', [['Cs-137', 500], ['Sr-90', 50]]);

    const srEntry = byId(r, 'codex_cxs193_other_sr90_group')[0];
    assert.deepEqual(srEntry.nuclides, ['Sr-90']);
    close(srEntry.ratio, 0.5);

    const csEntry = byId(r, 'codex_cxs193_other_cs_group')[0];
    assert.deepEqual(csEntry.nuclides, ['Cs-137']);
    close(csEntry.ratio, 0.5);
});

test('E07: вода, уровни ВОЗ (TECDOC-1788) — каждый нуклид со своим уровнем, не суммируются', () => {
    const r = run('water', 'Вода питьевая', [['Cs-137', 5], ['Sr-90', 5]]);

    const e = byId(r, 'iaea_tecdoc1788_who_sr90_i131_cs_u238');
    assert.equal(e.length, 2);

    for (const entry of e) {
        assert.equal(entry.nuclides.length, 1);
        close(entry.ratio, 0.5);
    }
});
