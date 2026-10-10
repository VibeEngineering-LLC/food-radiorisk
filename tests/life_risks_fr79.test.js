// #FR-79: набор данных life_risks (записи lr_*) — значения в (0,1), полнота, целое и части, сверка со сводкой; расчёт вкладки «Бытовые риски» (V08) — tests/fr81_v08_life_tab.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const recs = data.life_risks;
const get = (id) => recs.find(x => x.id === id);
const causes = recs.filter(x => x.kind === 'cause');
const IDS = ['lr_all_causes', 'lr_circulatory', 'lr_neoplasms', 'lr_lung_cancer', 'lr_external', 'lr_transport', 'lr_suicide', 'lr_poisoning', 'lr_homicide', 'lr_falls', 'lr_fire'];
const COLS = ['adult', 'child'];
const SEX = ['both', 'male', 'female'];

test('набор: 11 причин и одна ссылка, у каждой причины обе колонки и оба пола в (0, 1), провенанс', () => {
    assert.deepEqual(causes.map(x => x.id).sort(), [...IDS].sort());
    assert.equal(recs.filter(x => x.kind === 'cause' || x.kind === 'incidence_ref').length, 12); // #FR-81 V05: в наборе добавились life_table и cause_shares
    for (const x of causes) {
        for (const c of COLS) {
            for (const s of SEX) {
                assert.ok(x[c][s] > 0 && x[c][s] < 1, `${x.id} ${c} ${s}`);
            }
            assert.ok(x[c].both >= Math.min(x[c].male, x[c].female) && x[c].both <= Math.max(x[c].male, x[c].female), x.id + ' ' + c);
        }
        assert.equal(x.level, '✅');
        assert.equal(x.year, 2019);
        assert.equal(x.source, 'ROSSTAT_DEMOG2023');
        assert.ok(x.source_also.includes('WHO_MORTDB'));
        for (const f of ['label_ru', 'loc', 'quote', 'method']) {
            assert.ok(typeof x[f] === 'string' && x[f].length > 10, x.id + ' ' + f);
        }
        assert.ok(x.method.includes('таблице дожития') && x.method.includes('tools/risks_lifetime_calc.py'), x.id);
        assert.equal('value' in x, false);
    }
    const ref = get('lr_cancer_incidence');
    assert.equal(ref.kind, 'incidence_ref');
    assert.equal(ref.ref_id, 'cancer_baseline_ru_0_69');
    assert.equal(ref.source, 'MNIOI2023');
    for (const f of ['value', 'adult', 'child', 'p']) assert.equal(f in ref, false, f);
    const c = data.compare.find(x => x.id === ref.ref_id);
    assert.equal(c.value, 0.194);
});

test('значения совпадают со сводкой audit/risks-lifetime-ru-2026-10-05.md (проценты, 2019, оба пола)', () => {
    const exp = [
        ['lr_all_causes', 34.63, 35.34, 2], ['lr_circulatory', 13.07, 12.96, 2], ['lr_neoplasms', 7.28, 7.26, 2],
        ['lr_lung_cancer', 1.42, 1.40, 2], ['lr_external', 5.06, 5.35, 2], ['lr_transport', 0.687, 0.761, 3],
        ['lr_suicide', 0.645, 0.682, 3], ['lr_poisoning', 0.754, 0.767, 3], ['lr_homicide', 0.303, 0.309, 3],
        ['lr_falls', 0.202, 0.215, 3], ['lr_fire', 0.105, 0.112, 3]
    ];
    for (const [id, a, k, d] of exp) {
        const tol = 0.5 * 10 ** -d + 1e-9;
        assert.ok(Math.abs(get(id).adult.both * 100 - a) <= tol, id + ' adult');
        assert.ok(Math.abs(get(id).child.both * 100 - k) <= tol, id + ' child');
    }
    const tol = 0.0071; // сводка округляет 2,385 до 2,39: запас на округление
    assert.ok(Math.abs(get('lr_all_causes').adult.male * 100 - 47.65) <= tol);
    assert.ok(Math.abs(get('lr_all_causes').adult.female * 100 - 20.89) <= tol);
    assert.ok(Math.abs(get('lr_all_causes').child.male * 100 - 48.32) <= tol);
    assert.ok(Math.abs(get('lr_all_causes').child.female * 100 - 21.58) <= tol);
    assert.ok(Math.abs(get('lr_lung_cancer').adult.male * 100 - 2.39) <= tol);
    assert.ok(Math.abs(get('lr_lung_cancer').adult.female * 100 - 0.40) <= tol);
    assert.ok(Math.abs(get('lr_external').adult.male * 100 - 8.13) <= tol);
    assert.ok(Math.abs(get('lr_external').adult.female * 100 - 1.82) <= tol);
});

test('целое больше суммы частей: любая причина > БСК + новообразования + внешние; внешние > сумма их частей; рак лёгкого < новообразования', () => {
    for (const c of COLS) {
        for (const s of SEX) {
            const v = (id) => get(id)[c][s];
            const three = v('lr_circulatory') + v('lr_neoplasms') + v('lr_external');
            assert.ok(v('lr_all_causes') > three, `${c} ${s} all > sum`);
            const rest = v('lr_all_causes') - three;
            assert.ok(rest > 0.03 && rest < 0.15, `${c} ${s} rest`);
            const parts = ['lr_transport', 'lr_suicide', 'lr_poisoning', 'lr_homicide', 'lr_falls', 'lr_fire'].reduce((sum, id) => sum + v(id), 0);
            assert.ok(parts < v('lr_external'), `${c} ${s} parts < ext`);
            assert.ok(parts > 0.5 * v('lr_external'), `${c} ${s} parts > 0.5 ext`);
            assert.ok(v('lr_lung_cancer') < v('lr_neoplasms'), `${c} ${s} lung < neo`);
        }
    }
    assert.notEqual(get('lr_all_causes').adult.both, get('lr_all_causes').child.both);
});
