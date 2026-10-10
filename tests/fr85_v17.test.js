// #FR-85 v17 (D-027): коллизии коротких основ, подпись масла какао, растительное молоко, дикорастущая зелень, тексты интерфейса
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { matchProduct, wordForms } from '../src/calc/products.js';
import { computeScenario } from '../src/calc/model.js';
import { dietDefaultFor } from '../src/calc/diet.js';
import { summaryParts } from '../src/ui/summary_text.js';
import { buildReport } from '../src/ui/report.js';
import { renderJsx } from './render_helper.js';
import { T } from '../src/ui/texts_v.js';

const P = data.products;
const m = (n, confirm) => matchProduct(P, n, confirm);
const strip = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const META = { datasets: 1, records: 1, sha: 'abcdef0123456789' };
const ISO = '2026-10-09T12:00:00.000Z';
const CAPTION = 'в ТР ТС 021 не названо, отнесено к п. 20 (растительные масла)';

test('п. 1 (B4-4): слова не из словаря с общей короткой основой — не «ок» и без ложного кандидата', () => {
    const FALSE = {
        'налив': 'Налим',
        'белый налив': 'Налим',
        'репей': 'Репа',
        'медь': 'Мёд',
        'мясо тела': 'Мясо телят',
        'масло карите': 'Карась'
    };
    for (const [name, forbidden] of Object.entries(FALSE)) {
        const r = m(name);
        assert.notEqual(r.status, 'ok', name);
        for (const c of r.candidates) {
            assert.ok(c.name_ru !== forbidden && !c.name_ru.startsWith(forbidden), name);
        }
    }
});

test('п. 1: слова словаря с короткой основой узнаются во всех падежах (лось, мёд, репа, мясо, вода)', () => {
    const OK = {
        'лось': 'Лось',
        'лоси': 'Лось',
        'лосей': 'Лось',
        'лося': 'Лось',
        'мёд': 'Мёд',
        'меда': 'Мёд',
        'мёдом': 'Мёд',
        'репа': 'Репа',
        'репой': 'Репа',
        'репы': 'Репа',
        'лосось': 'Лосось'
    };
    for (const [name, expected] of Object.entries(OK)) {
        const r = m(name);
        assert.equal(r.status, 'ok', name);
        assert.equal(r.entry.name_ru, expected, name);
    }
    assert.equal(m('мясо').status, 'ok');
    assert.equal(m('мясом').status, 'ok');
    assert.equal(m('мёд гречневый').status, 'ok');
});

test('п. 1: формы слова строятся по его последней букве — «репей» не форма «репа», «медь» не форма «мёд»', () => {
    const fRepa = wordForms('репа');
    assert.ok(fRepa.has('репой'));
    assert.ok(fRepa.has('реп'));
    assert.ok(!fRepa.has('репей'));

    const fMed = wordForms('мед');
    assert.ok(fMed.has('медом'));
    assert.ok(!fMed.has('медь'));

    const fNalim = wordForms('налим');
    assert.ok(fNalim.has('налима'));
    assert.ok(!fNalim.has('налив'));

    const fBely = wordForms('белый');
    assert.ok(fBely.has('белая'));
    assert.ok(fBely.has('белых'));
    assert.ok(!fBely.has('белена'));

    const fLos = wordForms('лось');
    assert.ok(fLos.has('лосей'));

    const fTun = wordForms('тунец');
    assert.ok(fTun.has('тунца'));
});

test('B4-1: подпись масла какао — отдельное поле; видна в вердикте, отчёте (md, html) и на экране', async () => {
    // (a) Проверка полей записи продукта
    const e = m('масло какао').entry;
    assert.equal(e.name_ru, 'Масло какао');
    assert.equal(e.caption, CAPTION);
    assert.equal(m('масло подсолнечное').entry.caption, undefined);

    // (b) Проверка результата расчёта
    const input = inputFor('fats_oils', 'масло какао', [['Cs-137', 50]]);
    const result = computeScenario(data, input);
    assert.equal(result.limits.productCaption, CAPTION);

    // (c) Проверка текста вердикта
    const lines = summaryParts(result, input).verdict.lines.map(l => l.text);
    assert.ok(lines.some(line => line.includes('Масло какао') && line.includes(CAPTION)));

    // (d) Проверка отчётов в форматах md и html
    for (const format of ['md', 'html']) {
        const text = buildReport(format, { input, result }, META, ISO).text;
        assert.ok(text.includes(CAPTION), `отчёт ${format}`);
    }

    // (e) Проверка рендера JSX
    const html = strip(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'ru' }));
    assert.ok(html.includes(CAPTION));

    // (f) Проверка отсутствия подписи для обычного масла
    const plainIn = inputFor('fats_oils', 'масло подсолнечное', [['Cs-137', 50]]);
    const plainResult = computeScenario(data, plainIn);
    const plainText = buildReport('md', { input: plainIn, result: plainResult }, META, ISO).text;
    assert.ok(!plainText.includes('не названо'));
});

test('B4-2: растительное молоко — «норматив не установлен», не п. 5 (D-024)', () => {
    const names = ['растительное молоко', 'молоко растительное', 'Растительного молока'];
    for (const name of names) {
        const r = m(name);
        assert.equal(r.status, 'ok', name);
        assert.equal(r.entry.id, 'p_moloko_rastitelnoe', name);
        assert.equal(r.entry.norm.fresh, null, name);
    }

    assert.equal(typeof m('молоко').entry.norm.fresh, 'string');
    assert.equal(m('соевое молоко').entry.norm.fresh, null);
    assert.equal(m('коровье молоко').entry.id, m('молоко').entry.id);
});

test('B4-3: «дикий/дикорастущий» переключает чеснок, лук, зелень, щавель в дикоросы (D-026 п. 4)', () => {
    const WILD = [
        'чеснок дикорастущий',
        'дикорастущий чеснок',
        'дикий лук',
        'лук дикорастущий',
        'дикорастущая зелень',
        'зелень дикая',
        'щавель дикорастущий',
        'дикий укроп',
        'дикая петрушка'
    ];

    for (const n of WILD) {
        const r = m(n);
        assert.equal(r.status, 'ok', n);
        assert.equal(r.entry.diet.group, 'greens_wild', n);
        assert.equal(r.entry.norm.fresh, 't021_p4_r13_cs137', n);

        const d = dietDefaultFor(data.diet, {
            productName: n,
            state: 'fresh',
            age: 'adult',
            lifetime: null,
            mode: 'default',
            products: P
        });
        assert.notEqual(d.status, 'default', `${n}: рацион «не установлено»`);
    }

    const nonWild = ['чеснок', 'лук', 'зелень', 'щавель', 'укроп', 'петрушка'];
    for (const n of nonWild) {
        const r = m(n);
        assert.equal(r.status, 'ok', n);
        assert.notEqual(r.entry.diet.group, 'greens_wild', n);
    }
});

test('B4-9: таблица уровней вмешательства — без пустых скобок «()»', async () => {
    const input = inputFor('water', 'вода из крана', [['Cs-137', 20]]);
    const result = computeScenario(data, input);
    assert.ok(result.limits.intervention);

    const html = strip(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'uv' }));
    assert.ok(html.includes('НРБ-99/2009, Прил. 2а'));
    assert.ok(!html.includes('()'));
    assert.ok(!html.includes('( )'));
});

test('B4-11: «добавило бы к ним около меньше 0,01» -> «добавило бы к ним меньше 0,01»; обычное число — с «около»', () => {
    const lo = inputFor('milk', 'молоко', [['Cs-137', 0.0001]]);
    const bgLo = summaryParts(computeScenario(data, lo), lo).background;
    assert.ok(bgLo.includes('добавило бы к ним меньше 0,01'));
    assert.ok(!bgLo.includes('около меньше'));

    const hi = inputFor('milk', 'молоко', [['Cs-137', 100]]);
    const bgHi = summaryParts(computeScenario(data, hi), hi).background;
    assert.ok(bgHi.includes('добавило бы к ним около 0,06'));

    assert.ok(T.BG_CANCER.includes('к ним {k}.'));
});
