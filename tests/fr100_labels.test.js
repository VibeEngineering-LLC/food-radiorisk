import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { doseSlices, homeRadonDoseSv } from '../src/calc/summary_charts.js';
import { parseExt, EXT_DEFAULTS } from '../src/react/persist.js';
import { T } from '../src/ui/texts_v.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const input = inputFor('milk','молоко',[['Cs-137',100,10]],{portionKg:0.5,portionsPerYear:365,years:1,region:'world'}); // #FR-101: названия секторов проверяются в режиме по умолчанию «Мир»
const result = computeScenario(data, input);
const sum = async (props = {}) => renderJsx('src/react/SummaryTab.jsx','default',{ result, input, radonC: NaN, dwellU: NaN, flightN: 2, xrayN: NaN, ctN: NaN, ...props }); // NaN = не введено → умолчание региона
const fig = (html, id) => html.match(new RegExp('data-chart="' + id + '"[^]*?</figure>'))[0];
const legend = (f) => norm(f.match(/<table class="pie-legend"[^]*?<\/table>/)[0]);

test('FR-100 названия секторов облучения однозначны', async () => {
    const html = await sum();
    const leg = legend(fig(html, 'dose'));
    const expected = [
        'Этот продукт: молоко (Cs-137) — по расчёту',
        'Радон в жилище (40 Бк/м³, по умолчанию)',
        'Природные радионуклиды в пище и воде (калий-40, полоний-210 и др.)',
        'Гамма-излучение грунта и стройматериалов (среднее)',
        'Космическое излучение (среднее)',
        'Компьютерная томография грудной клетки (0,00671 в год, по умолчанию — среднее на жителя)',
        'Рентгенография и флюорография (0,359 в год, по умолчанию — среднее на жителя)',
        'Остальная медицинская диагностика',
        'Авиаперелёты (2 × 3 ч в год, по умолчанию)'
    ];
    for (const s of expected) {
        assert.ok(leg.includes(s), `Легенда dose не содержит: ${s}`);
    }
});

test('FR-100 названия причин смерти для населения', async () => {
    const html = await sum();
    const leg = legend(fig(html, 'risk'));
    const expected = [
        'Болезни системы кровообращения (инфаркт, инсульт)',
        'Злокачественные и другие новообразования (рак)',
        'Дорожно-транспортные происшествия',
        'Падения',
        'Прочие причины смерти',
        'Этот продукт: молоко — радиационно-индуцированный рак'
    ];
    for (const s of expected) {
        assert.ok(leg.includes(s), `Легенда risk не содержит: ${s}`);
    }
});

test('FR-100 в легендах нет сокращений и канцелярита', async () => {
    const html = await sum();
    const legDose = legend(fig(html, 'dose'));
    const legRisk = legend(fig(html, 'risk'));
    
    // Получаем текст вкладки 'life' из Result.jsx
    const lifeHtml = await renderJsx('src/react/Result.jsx', 'default', { result, input, initialTab: 'life' });
    const lifeText = norm(lifeHtml);

    const forbidden = [
        'внутр.',
        'Умереть от',
        'Питание (',
        'Питание:',
        'Земля и стройматериалы',
        'ОА '
    ];

    for (const s of forbidden) {
        assert.ok(!legDose.includes(s), `Легенда dose содержит запрещённую подстроку: ${s}`);
        assert.ok(!legRisk.includes(s), `Легенда risk содержит запрещённую подстроку: ${s}`);
        assert.ok(!lifeText.includes(s), `Текст вкладки life содержит запрещённую подстроку: ${s}`);
    }
});

test('FR-100 снимки: сектор называется «дополнительные», ноль его убирает', async () => {
    // #FR-101: рентгенография — один из трёх секторов медицины; введённое N меняет только его, ноль его убирает
    const html1 = await sum({ xrayN: 1 });
    const leg1 = legend(fig(html1, 'dose'));
    assert.ok(leg1.includes('Рентгенография и флюорография (1 в год, введено пользователем)'), 'Легенда dose при xrayN=1 не содержит ожидаемую строку');
    assert.ok(leg1.includes('Остальная медицинская диагностика'), 'Легенда dose при xrayN=1 не содержит «остальную»');

    const html0 = await sum({ xrayN: 0 });
    const leg0 = legend(fig(html0, 'dose'));
    assert.ok(!leg0.includes('Рентгенография и флюорография'), 'Легенда dose при xrayN=0 содержит сектор рентгенографии');
    assert.ok(leg0.includes('Остальная медицинская диагностика'), 'Легенда dose при xrayN=0 не содержит «остальную»');

    const html2 = await sum({ xrayN: 2 });
    const leg2 = legend(fig(html2, 'dose'));
    assert.ok(leg2.includes('Рентгенография и флюорография (2 в год, введено пользователем)'), 'Легенда dose при xrayN=2 не содержит ожидаемую строку');

    // Проверка значений доз в doseSlices
    const H = result.comparison.horizonYears;
    const radonDose = homeRadonDoseSv(input, result.comparison, 200);
    const slices = doseSlices(result.comparison, radonDose, { radonC: 200, xrayN: 2, flightN: 2 });
    
    const xraySlice = slices.slices.find(s => s.id === 'med_rad');
    const medSlice = slices.slices.find(s => s.id === 'med_other');
    const P = result.comparison.parts;

    const expectedXray = 2 * P.rad.doseProc * 1e-3 * H;
    const expectedMed = (P.medicine.msv - P.ct.freq * P.ct.share * P.ct.doseProc - P.rad.freq * P.rad.doseProc) * 1e-3 * H; // «остальная» — от умолчаний, ввод N её не меняет

    assert.ok(Math.abs(xraySlice.doseSv - expectedXray) / expectedXray < 1e-9, `Доза xray не совпадает: ${xraySlice.doseSv} vs ${expectedXray}`);
    assert.ok(Math.abs(medSlice.doseSv - expectedMed) / expectedMed < 1e-9, `Доза medicine не совпадает: ${medSlice.doseSv} vs ${expectedMed}`);
});

test('FR-100 подпись про двойной счёт', async () => {
    assert.ok(T.SUM_MED_NOTE.includes('без двойного счёта'), 'T.SUM_MED_NOTE не содержит "без двойного счёта"');
    assert.ok(T.SUM_MED_NOTE.includes('меняют только свой сектор'), 'T.SUM_MED_NOTE не содержит "меняют только свой сектор"');
    assert.ok(T.CMP_FIELDS_HINT.includes('уже входят в среднюю медицинскую дозу'), 'T.CMP_FIELDS_HINT не содержит ожидаемую строку');

    const html = await sum();
    assert.ok(html.includes('калий-40'), 'HTML сводки не содержит "калий-40"');
});

test('FR-100 сохранённое состояние не затронуто', () => {
    assert.ok(Number.isNaN(EXT_DEFAULTS.xrayN) && Number.isNaN(EXT_DEFAULTS.ctN), 'v3: «не введено» = NaN');

    const parsed1 = parseExt('{"v":3,"radonC":100,"dwellU":null,"ctN":2,"xrayN":3,"flightN":2}');
    assert.equal(parsed1.xrayN, 3);
    assert.equal(parsed1.radonC, 100);

    const parsed2 = parseExt('{"v":2,"radonC":200,"dwellU":0.15,"xrayN":3,"flightN":1}'); // прежний смысл поля xrayN и прежние умолчания отбрасываются
    assert.ok(Number.isNaN(parsed2.radonC) && Number.isNaN(parsed2.xrayN) && Number.isNaN(parsed2.dwellU));
    assert.equal(parsed2.flightN, 1);
});

test('FR-100 поля вкладки Сравнение', async () => {
    const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, initialTab: 'cmp' });
    const text = norm(html);
    
    assert.ok(text.includes('Объёмная активность радона-222 в жилище'), 'Текст вкладки cmp не содержит "Объёмная активность радона-222 в жилище"');
    assert.ok(text.includes('Рентгенографий и флюорографий в год') && text.includes('КТ в год'), 'Текст вкладки cmp не содержит поля КТ и рентгенографий');
    assert.ok(!text.includes('ОА радона'), 'Текст вкладки cmp содержит "ОА радона"');
});
