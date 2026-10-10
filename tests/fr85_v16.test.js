import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { matchProduct } from '../src/calc/products.js';
import { dietDefaultFor, dietScopeText } from '../src/calc/diet.js';
import { T } from '../src/ui/texts_v.js';

const P = data.products;
const m = (n, confirm) => matchProduct(P, n, confirm);
const pick = (name) => dietDefaultFor(data.diet, { productName: name, state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products: P });

test('масло какао: натуральное — п. 20 Прил. 4 ТР ТС 021, подпись для пользователя', () => {
    const names = ['масло какао', 'Масло какао', 'какао-масло', 'какао масло', 'масло какао-бобов', 'масло какао бобов', 'какао масло натуральное', 'масло какао натуральное'];
    const caption = 'в ТР ТС 021 не названо, отнесено к п. 20 (растительные масла)';
    for (const n of names) {
        const res = m(n);
        assert.equal(res.status, 'ok', n);
        assert.equal(res.entry.id, 'p_kakao_maslo', n);
        assert.equal(res.entry.norm.fresh, 't021_p4_r20_cs137', n);
        assert.equal(res.entry.norm.dried, 't021_p4_r20_cs137', n);
        assert.equal(res.entry.name_ru, 'Масло какао', n); // v17: подпись — отдельное поле caption (проверяет fr85_v17), название — «Масло какао»
    }
});

test('масло какао: эквиваленты, улучшители и заменители — п. 21', () => {
    const names = ['эквивалент масла какао', 'заменитель масла какао', 'улучшитель масла какао', 'заменители масла какао', 'эквиваленты масла какао', 'масло какао заменитель'];
    const caption = 'в ТР ТС 021 не названо, отнесено к п. 20 (растительные масла)';
    for (const n of names) {
        const res = m(n);
        assert.equal(res.status, 'ok', n);
        assert.equal(res.entry.id, 'p_kakao_maslo_zamenitel', n);
        assert.equal(res.entry.norm.fresh, 't021_p4_r21_cs137', n);
        assert.ok(!res.entry.name_ru.includes(caption) && res.entry.caption === undefined, n);
    }
});

test('масло какао: рацион — группа масел, «оценка сверху» как у других масел', () => {
    const SCOPE = T.DIET_SCOPE.split('{')[0];
    const names = ['масло какао', 'какао-масло', 'заменитель масла какао', 'масло подсолнечное'];
    for (const n of names) {
        const res = pick(n);
        assert.equal(res.status, 'default', n);
        assert.equal(res.group.code, 'oil', n);
        assert.equal(res.group.direction, 'upper', n);
        assert.ok(dietScopeText(res.group).startsWith(SCOPE), n);
    }
    assert.equal(m('масло какао').entry.diet.base, false, 'масло какао: base');
    assert.equal(m('заменитель масла какао').entry.diet.base, false, 'заменитель: base');
});
