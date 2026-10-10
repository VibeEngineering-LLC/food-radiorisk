import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { doseSlices, riskSlices, homeRadonDoseSv, homeDwellingDoseSv } from '../src/calc/summary_charts.js';
import { horizonYears, startAge } from '../src/calc/compare.js';
import { makeLifeTable, causeProb } from '../src/calc/life_table.js';
import { NOMINAL_AGE } from '../src/calc/years.js';
import { radonRisk } from '../src/vendor/radon_risk/radonRisk.mjs';
import { T } from '../src/ui/texts_v.js';

// Вспомогательные функции
const ADULT = () => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const close = (x, y, rel) => Math.abs(x - y) <= rel * Math.max(Math.abs(x), Math.abs(y), 1e-300);
const rec = (id) => data.compare.find(r => r.id === id);
const dataWith = (id, patch) => ({ ...data, compare: data.compare.map(r => r.id === id ? { ...r, ...patch } : r) });
const dataWithout = (ids) => ({ ...data, compare: data.compare.filter(r => !ids.includes(r.id)) });
const summary = async (dataX, input, radonC, dwellU) => {
    const result = computeScenario(dataX, input);
    const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC, dwellU });
    return { result, html, text: norm(html) };
};

test('FR-89 v27: радон и торон фона — записи данных обоих регионов с источником и цитатой; НКДАР 2008 оставлен как superseded', () => {
    const old = [rec('bg_radon_world'), rec('bg_thoron_world')];
    assert.ok(old.every(r => r.superseded === true && r.region === 'world' && r.source === 'UNSCEAR2008'), 'НКДАР 2008 — история, в расчёт не входит');
    const w = rec('w26_radon'), r = rec('ru20_radon');
    assert.equal(w.region, 'world'); assert.equal(r.region, 'ru');
    assert.equal(w.value, 1.8); assert.equal(r.value, 2.0);
    assert.equal(w.source, 'UNSCEAR2026_PR'); assert.equal(r.source, 'BARKOVSKY2021');
    assert.ok([w, r].every(x => x.unit === 'мЗв/год' && x.role === 'radon' && x.quote && x.loc));

    // Проверка отсутствия хардкода в коде
    const src = readFileSync('src/calc/summary_charts.js', 'utf8');
    assert.ok(!src.includes('1.25'), 'Не должно быть хардкода 1.25');
    assert.ok(!src.includes('WORLD_RADON_MSV_PER_YEAR'), 'Не должно быть константы WORLD_RADON_MSV_PER_YEAR');
});

test('FR-89 v27: вычитаемое из фона на экране равно сумме записей данных, и подмена записи меняет диаграмму', async () => {
    const input = ADULT();
    const { result, text } = await summary(data, input, 100, NaN);
    const H = horizonYears(input);
    const bgPerYear = rec('ru20_natural_total').value * 1e-3;
    const sumRT = rec('ru20_radon').value;

    // #FR-101: фон разложен на составляющие из данных региона; радон и торон — одна запись ru20_radon (сценарий задан с region: 'ru')
    assert.ok(text.includes('разложен на составляющие'), 'Текст говорит о разложении фона');
    assert.ok(text.includes('Барковский'), 'Текст должен содержать источник региона');
    assert.ok(text.includes(String(sumRT).replace('.', ',')), 'Текст содержит значение радона из данных');

    const ds = doseSlices(result.comparison, null, { radonC: 100, radonIsDefault: true });
    const radonW = ds.slices.find(s => s.id === 'radon');
    assert.ok(close(radonW.doseSv, sumRT * 1e-3 * H, 1e-9), 'Радон и торон мирового фона = сумма записей данных × H');

    // Мутация данных
    const dataX = dataWith('ru20_radon', { value: 0.5 });
    const resultX = computeScenario(dataX, input);
    const dsX = doseSlices(resultX.comparison, null, {});
    const radonSliceX0 = dsX.slices.find(s => s.id === 'radon');
    assert.ok(close(radonSliceX0.doseSv, 0.5 * 1e-3 * H, 1e-9), 'Радон фона региона после подмены записи изменился');
    assert.ok(!close(radonSliceX0.doseSv, radonW.doseSv, 1e-9), 'Значения должны отличаться');
    assert.ok(close(dsX.naturalSumMsv, ds.naturalSumMsv - (rec('ru20_radon').value - 0.5), 1e-9), 'Сумма природных составляющих следует за записью');

    // Без записей
    const dsN = doseSlices(computeScenario(dataWithout(['ru20_radon']), input).comparison, null);
    assert.equal(dsN, null, 'Должно быть null без записей');
});

test('FR-89 v27: ОА радона из поля вкладки «Сравнение» меняет долю радона', async () => {
    const input = ADULT();
    const shares = [];
    
    for (const C of [50, 400]) {
        const result = computeScenario(data, input);
        const cmp = result.comparison;
        const rad = homeRadonDoseSv(input, cmp, C);
        const expected = radonRisk({ C, years: horizonYears(input), ageStart: startAge(input), smoking: 'never', F: 0.5 }) /* #FR-101 v41: Россия */.totalDose_mSv * 1e-3;
        assert.ok(close(rad, expected, 1e-12), 'Доза радона должна совпадать с расчётом');
        
        const ds = doseSlices(cmp, rad, { radonC: C, radonIsDefault: false });
        const radonSlice = ds.slices.find(s => s.id === 'radon');
        assert.ok(close(radonSlice.doseSv, expected, 1e-12), 'Слайс радона должен совпадать');
        const share = radonSlice.doseSv / ds.total;
        shares.push(share);
    }
    
    assert.ok(shares[1] > shares[0], 'Доля радона при 400 Бк/м³ должна быть больше, чем при 50');
    
    const textA = (await summary(data, input, 50, NaN)).text;
    assert.ok(textA.includes('введено вами'), 'Текст должен указывать на ввод пользователя');
    assert.ok(textA.includes('по вашему вводу'), 'Текст должен указывать на ввод пользователя');
    assert.ok(textA.includes('50 Бк/м³'), 'Текст должен содержать значение 50');
    
    const textD = (await summary(data, input, NaN, NaN)).text; // #FR-101: NaN = «не введено» → умолчание региона
    assert.ok(textD.includes('значение по умолчанию'), 'Текст должен указывать на значение по умолчанию');
    assert.ok(textD.includes('по умолчанию'), 'Текст должен указывать на значение по умолчанию');
    assert.ok(!textD.includes('по вашему вводу'), 'Текст не должен указывать на ввод пользователя');
});

test('FR-89 v27: показание дозиметра в жилище заменяет остальной фон на диаграмме', async () => {
    const input = ADULT();
    const { result } = await summary(data, input, 100, NaN);
    const cmp = result.comparison;
    const U = 0.12;
    const expectedSv = U * 1e-6 * rec('dwell_hours').value * rec('dwell_h10_to_e').value * horizonYears(input);
    
    assert.ok(close(homeDwellingDoseSv(cmp, U), expectedSv, 1e-12), 'Доза от дозиметра должна совпадать');
    assert.equal(homeDwellingDoseSv(cmp, NaN), null, 'NaN должен давать null');
    assert.equal(homeDwellingDoseSv(cmp, 0), null, '0 должно давать null');
    assert.equal(homeDwellingDoseSv(cmp, 101), null, '101 должно давать null');
    
    const ds = doseSlices(cmp, null, { dwellingSv: expectedSv });
    const terr = ds.slices.find(s => s.id === 'terrestrial');
    assert.ok(close(terr.doseSv, rec('ru_outdoor_rate').value * (8760 - rec('dwell_hours').value) / 1000 * 1e-3 * horizonYears(input) + expectedSv, 1e-9), 'Излучение в помещении заменяется дозой от дозиметра (улица остаётся средней)');
    assert.ok(terr.label.includes('по вашему дозиметру'), 'Метка должна указывать на дозиметр');
    
    const textU = (await summary(data, input, 100, U)).text;
    assert.ok(textU.includes('0,12 мкЗв/ч'), 'Текст должен содержать значение дозиметра');
    assert.ok(textU.includes('по вашему дозиметру'), 'Текст должен указывать на дозиметр');
    
    const textN = (await summary(data, input, 100, NaN)).text;
    assert.ok(!textN.includes('по вашему дозиметру'), 'Текст не должен указывать на дозиметр при NaN');
});

test('FR-89 v27: на вкладке «Сравнение» оба поля ввода на месте и состояние общее', async () => {
    const input = ADULT();
    const result = computeScenario(data, input);
    const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: { datasets: 0, records: 0, sha: '00000000' }, initialTab: 'cmp' });
    const text = norm(html);
    
    assert.ok(text.includes('Мощность дозы в жилище, мкЗв/ч'), 'Текст должен содержать поле дозиметра');
    assert.ok(text.includes('Объёмная активность радона-222 в жилище, Бк/м³'), 'Текст должен содержать поле радона');
    
    const inputCount = (html.match(/<input[^>]*type="number"/g) || []).length;
    assert.ok(inputCount >= 2, 'Должно быть минимум 2 числовых поля ввода');
    
    const src = readFileSync('src/react/Result.jsx', 'utf8');
    assert.ok(src.match(/<SummaryTab[^>]*radonC=\{radonC\}[^>]*dwellU=\{dwellU\}/), 'SummaryTab должен получать radonC и dwellU');
    assert.ok(src.match(/<Compare[^>]*radonC=\{radonC\}[^>]*setRadonC=\{setRadonC\}[^>]*dwellU=\{dwellU\}[^>]*setDwellU=\{setDwellU\}/), 'Compare должен получать radonC, setRadonC, dwellU, setDwellU');
});

test('FR-89 v27: «см. ниже» заменено ссылкой на вкладку', async () => {
    const { text } = await summary(data, ADULT(), 100, NaN);
    assert.ok(text.includes('см. вкладку «Соответствие нормам»'), 'Текст должен содержать ссылку на вкладку');
    assert.ok(!text.includes('см. ниже'), 'Текст не должен содержать «см. ниже»');
    
    const strings = Object.values(T).filter(v => typeof v === 'string');
    for (const s of strings) {
        assert.ok(!s.includes('см. ниже'), 'Строки в T не должны содержать «см. ниже»');
    }
});

test('FR-89 v27: болезни системы кровообращения — вторая строка бытовых рисков и сектор диаграммы', async () => {
    const scenarios = [
        ADULT(),
        inputFor('milk', 'молоко', [['Cs-137', 50, 5]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } })
    ];
    
    for (const input of scenarios) {
        const result = computeScenario(data, input);
        const life = result.lifeRisks;
        const a = input.lifetime ? input.lifetime.fromAge : NOMINAL_AGE[input.age];
        const table = makeLifeTable(data.life_risks.filter(x => x.region !== 'world')); // #FR-101: сценарии заданы с region: 'ru'
        
        assert.equal(life.rows[2].id, 'cs_1064', 'Вторая строка должна быть cs_1064');
        assert.ok(close(life.rows[2].p, causeProb(table, '1064', a, life.b), 1e-12), 'Вероятность должна совпадать');
        
        assert.equal(life.lifetime.rows[2].id, 'cs_1064', 'Вторая строка lifetime должна быть cs_1064');
        assert.ok(close(life.lifetime.rows[2].p, causeProb(table, '1064', a, a + horizonYears(input)), 1e-12), 'Вероятность lifetime должна совпадать');
        
        const rs = riskSlices(life);
        assert.ok(rs.slices.some(s => s.id === 'cs_1064'), 'сектор кровообращения есть (порядок секторов — по возрастанию, v29)');
        assert.equal(rs.slices.length, 11, 'питание + 9 причин + «прочие» (FR-93)');
        
        const htmlLife = norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: { datasets: 0, records: 0, sha: '00000000' }, initialTab: 'life' }));
        assert.ok(htmlLife.includes('кровообращения'), 'Текст вкладки «Риски» должен содержать «кровообращения»');
        
        const textSummary = (await summary(data, input, 100, NaN)).text;
        assert.ok(textSummary.includes('кровообращения'), 'Текст сводки должен содержать «кровообращения»');
    }
});

// #FR-89 v27: доля радона на ЭКРАНЕ «Сводки» считается по ОА, переданной из поля вкладки «Сравнение» (мутация «Сводка игнорирует ввод» красит этот тест)
test('FR-89 v27: на экране «Сводки» доля радона равна посчитанной модулем radon_risk для введённой ОА', async () => {
  const input = ADULT();
  const shown = [];
  for (const C of [50, 400]) {
    const { result, text } = await summary(data, input, C, NaN);
    const cmp = result.comparison;
    const rad = radonRisk({ C, years: horizonYears(input), ageStart: startAge(input), smoking: 'never', F: 0.5 }) /* #FR-101 v41: Россия */.totalDose_mSv * 1e-3;
    const ds = doseSlices(cmp, rad, { radonC: C, radonIsDefault: false });
    const share = ds.slices.find(s => s.id === 'radon').share;
    const printed = (share * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 2 });
    assert.ok(text.includes(printed + ' %'), `ОА ${C}: на экране должна быть доля радона ${printed} %`);
    shown.push(printed);
  }
  assert.notEqual(shown[0], shown[1], 'две разные ОА дают разные доли радона на экране');
});
