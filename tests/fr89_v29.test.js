import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { doseSlices, riskSlices, homeRadonDoseSv, homeDwellingDoseSv, DEFAULT_FLIGHT_PER_YEAR } from '../src/calc/summary_charts.js';
// #FR-101 v41 (D-031): тесты ниже проверяли отменённые умолчания (200 Бк/м³, 0,15 мкЗв/ч, 1 снимок) и 8 секторов НКДАР 2008 — заменён fr101_region / fr101_sectors (D-031); файл сохранён как история проверок, тела не выполняются
const DEFAULT_XRAY_PER_YEAR = 1;
const test = (name) => nodeTest.skip(name + ' [заменён fr101_region / fr101_sectors (D-031)]');
import { SLICE_COLOR } from '../src/calc/dose_sources.js';
import { horizonYears } from '../src/calc/compare.js';
import { parseExt, EXT_DEFAULTS } from '../src/react/persist.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const close = (x, y, rel) => Math.abs(x - y) <= rel * Math.max(Math.abs(x), Math.abs(y), 1e-300);
const ADULT = () => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const CHILD = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const OPERATOR = () => inputFor('milk', 'молоко', [['Cs-137', 4400, 0], ['Sr-90', 100, 0]], { portionKg: 1.05, portionsPerYear: 1, years: 1 });
const rec = (id) => data.compare.find(r => r.id === id).value;
const without = (ids) => ({ ...data, compare: data.compare.filter(r => !ids.includes(r.id)) });
const slicesOf = (dataX, input, opts = {}, C = 200) => {
  const result = computeScenario(dataX, input);
  const cmp = result.comparison;
  return { result, cmp, ds: doseSlices(cmp, homeRadonDoseSv(input, cmp, C), { radonC: C, radonIsDefault: C === 200, ...opts }) };
};
const summary = async (dataX, input, props = {}) => {
  const result = computeScenario(dataX, input);
  const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: 200, ...props });
  return { result, html, text: norm(html) };
};

test('FR-91 v29: регрессия: на сценарии оператора диаграмма (а) есть и содержит радон', async () => {
  const { ds } = slicesOf(data, OPERATOR());
  assert.ok(ds, 'ds не null');
  assert.ok(ds.slices.some(s => s.id === 'radon'), 'есть радон');

  const { html, text } = await summary(data, OPERATOR());
  assert.ok(html.includes('data-chart="dose"'), 'есть data-chart="dose"');
  assert.ok(!text.includes('Диаграмма недоступна'), 'нет сообщения о недоступности');

  const dataX = without(['bg_radon_world', 'bg_thoron_world']);
  const { text: t2 } = await summary(dataX, OPERATOR());
  assert.ok(t2.includes('Обновите страницу'), 'есть сообщение об обновлении');
  assert.ok(!t2.includes('нет данных сравнения'), 'нет сообщения "нет данных сравнения"');

  const dataY = without(['bg_cosmic_world']);
  const { text: t3 } = await summary(dataY, OPERATOR());
  assert.ok(t3.includes('Обновите страницу'), 'есть сообщение об обновлении для космического');
  assert.ok(!t3.includes('нет данных сравнения'), 'нет сообщения "нет данных сравнения" для космического');
});

test('FR-91 v29: старое сохранённое состояние не ломает диаграмму', async () => {
  const defaults = EXT_DEFAULTS;
  assert.equal(defaults.radonC, 200);
  assert.equal(defaults.dwellU, 0.15); // умолчания оператора FR-91 v33
  assert.equal(defaults.xrayN, 1);
  assert.equal(defaults.flightN, 2);

  const badInputs = ['', 'не json', 'null', '[]', '{}', JSON.stringify({ radonC: 'abc', xrayN: -3, flightN: null, dwellU: 'x' })];
  for (const s of badInputs) {
    const parsed = parseExt(s);
    assert.deepEqual(parsed, defaults, `parseExt(${JSON.stringify(s)}) должно равняться EXT_DEFAULTS`);
  }

  const good = parseExt(JSON.stringify({ radonC: 250, dwellU: 0.12, xrayN: 3, flightN: 0 }));
  assert.deepEqual(good, { radonC: 250, dwellU: 0.12, xrayN: 3, flightN: 0 });

  const props = parseExt('{}');
  const { html } = await summary(data, ADULT(), props);
  assert.ok(html.includes('data-chart="dose"'), 'диаграмма есть при дефолтных props');
});

test('FR-91 v29: все источники есть, доза = значение данных × H (× частота), сумма природных = фон', async () => {
  const inputs = [ADULT(), CHILD()];
  for (const input of inputs) {
    const { cmp, ds, result } = slicesOf(data, input);
    const H = horizonYears(input);

    const expected = {
      radon: homeRadonDoseSv(input, cmp, 200),
      medicine: rec('med_percaput_world') * 1e-3 * H,
      flights: DEFAULT_FLIGHT_PER_YEAR * rec('flight_3h') * 1e-3 * H,
      xray: DEFAULT_XRAY_PER_YEAR * rec('med_chest_xray') * 1e-3 * H,
      cosmic: rec('bg_cosmic_world') * 1e-3 * H,
      terrestrial: (rec('street_external') + rec('bg_terr_indoor_world')) * 1e-3 * H,
      internal: (rec('bg_ingest_world') + rec('bg_inhal_ut_world')) * 1e-3 * H,
      product: cmp.rows.find(r => r.id === 'product').doseSv
    };

    const ids = ds.slices.map(s => s.id).sort();
    const expectedIds = Object.keys(expected).sort();
    assert.deepEqual(ids, expectedIds, 'совпадение id срезов');

    for (const [id, val] of Object.entries(expected)) {
      const slice = ds.slices.find(s => s.id === id);
      assert.ok(slice, `есть срез ${id}`);
      assert.ok(close(slice.doseSv, val, 1e-9), `доза ${id} близка к ожидаемой`);
    }

    const sumShares = ds.slices.reduce((a, s) => a + s.share, 0);
    assert.ok(close(sumShares, 1, 1e-12), 'сумма долей = 1');


    const publishedNatural = rec('bg_cosmic_world') + rec('bg_terr_indoor_world') + rec('street_external') + rec('bg_ingest_world') + rec('bg_inhal_ut_world') + rec('bg_radon_world') + rec('bg_thoron_world');
    assert.ok(close(ds.naturalSumMsv, publishedNatural, 1e-9), 'сумма природных близка к опубликованной');

    const gap = ds.naturalSumMsv - rec('bg_natural_world');
    assert.ok(close(ds.naturalGapMsv, gap, 1e-9), 'разница близка');
    assert.ok(Math.abs(ds.naturalGapMsv) < 0.05, 'разница < 0.05 мЗв');
  }
});

test('FR-91 v29: строки и сектора по возрастанию величины, цвет закреплён за источником', async () => {
  const inputs = [ADULT(), CHILD()];
  const productIndexes = [];

  for (const input of inputs) {
    const { ds, result } = slicesOf(data, input);

    for (let i = 1; i < ds.slices.length; i++) {
      assert.ok(ds.slices[i].doseSv >= ds.slices[i - 1].doseSv, 'дозы не убывают');
    }

    for (const s of ds.slices) {
      assert.equal(s.ci, SLICE_COLOR[s.id], 'цвет закреплён за источником');
    }

    const prodIdx = ds.slices.findIndex(s => s.id === 'product');
    assert.ok(prodIdx !== -1, 'есть продукт');
    assert.ok(ds.slices[prodIdx].me === true, 'продукт помечен me');
    productIndexes.push(prodIdx);

    const risks = riskSlices(result.lifeRisks);
    for (let i = 1; i < risks.slices.length; i++) {
      assert.ok(risks.slices[i].p >= risks.slices[i - 1].p, 'риски не убывают');
    }
  }

  assert.ok(Math.max(...productIndexes) > 0, 'продукт не всегда на первом месте');

  const { html, text } = await summary(data, ADULT());
  const startIdx = html.indexOf('data-chart="dose"');
  const endIdx = html.indexOf('</figure>', startIdx);
  const figureHtml = html.substring(startIdx, endIdx);
  const figureText = norm(figureHtml);

  const { ds } = slicesOf(data, ADULT());
  let lastIdx = -1;
  for (const s of ds.slices) {
    const idx = figureText.indexOf(s.id === 'product' ? 'Этот продукт: молоко' : s.label);
    assert.ok(idx > lastIdx, `легенда: ${s.label} после предыдущего`);
    lastIdx = idx;
  }
});

test('FR-91 v29: частота снимков и перелётов меняет сектор; ноль убирает сектор', async () => {
  const input = ADULT();
  const { ds: base } = slicesOf(data, input);

  const { ds: dsX } = slicesOf(data, input, { xrayN: 5, flightN: 6, xrayDefault: false, flightDefault: false });

  const baseXray = base.slices.find(s => s.id === 'xray').doseSv;
  const baseFlights = base.slices.find(s => s.id === 'flights').doseSv;
  const dsXXray = dsX.slices.find(s => s.id === 'xray').doseSv;
  const dsXFlights = dsX.slices.find(s => s.id === 'flights').doseSv;

  assert.ok(close(dsXXray, 5 * baseXray, 1e-9), 'xray = 5 × базовый');
  assert.ok(close(dsXFlights, 3 * baseFlights, 1e-9), 'flights = 3 × базовый');

  const baseXrayLabel = base.slices.find(s => s.id === 'xray').label;
  const baseFlightsLabel = base.slices.find(s => s.id === 'flights').label;
  const dsXXrayLabel = dsX.slices.find(s => s.id === 'xray').label;
  const dsXFlightsLabel = dsX.slices.find(s => s.id === 'flights').label;

  assert.ok(dsXXrayLabel.includes('по вашему вводу'), 'xray: по вашему вводу');
  assert.ok(dsXFlightsLabel.includes('по вашему вводу'), 'flights: по вашему вводу');
  assert.ok(baseXrayLabel.includes('по умолчанию'), 'xray: по умолчанию');
  assert.ok(baseFlightsLabel.includes('по умолчанию'), 'flights: по умолчанию');

  const { ds: ds0 } = slicesOf(data, input, { xrayN: 0 });
  assert.ok(!ds0.slices.some(s => s.id === 'xray'), 'xray отсутствует при 0');

  const { ds: dsNaN } = slicesOf(data, input, { xrayN: NaN });
  const dsNaNXray = dsNaN.slices.find(s => s.id === 'xray').doseSv;
  assert.ok(close(dsNaNXray, baseXray, 1e-9), 'NaN xrayN -> дефолт');
});

test('FR-91 v29: фон в жилище по вводу заменяет, а не прибавляется', async () => {
  const input = ADULT();
  const { cmp, ds: base } = slicesOf(data, input);
  const H = horizonYears(input);

  const dwellSv = homeDwellingDoseSv(cmp, 0.12);
  const { ds: dsD } = slicesOf(data, input, { dwellingSv: dwellSv });

  const expectedTerr = rec('street_external') * 1e-3 * H + dwellSv;
  const dsDTerr = dsD.slices.find(s => s.id === 'terrestrial').doseSv;
  assert.ok(close(dsDTerr, expectedTerr, 1e-9), 'terrestrial = улица + ввод');

  const diff = dsD.total - base.total;
  const expectedDiff = dwellSv - rec('bg_terr_indoor_world') * 1e-3 * H;
  assert.ok(close(diff, expectedDiff, 1e-9), 'разница = ввод - старый интерьер');

  const baseCosmic = base.slices.find(s => s.id === 'cosmic').doseSv;
  const dsDCosmic = dsD.slices.find(s => s.id === 'cosmic').doseSv;
  assert.ok(close(dsDCosmic, baseCosmic, 1e-9), 'cosmic не изменился');

  const dsDTerrLabel = dsD.slices.find(s => s.id === 'terrestrial').label;
  assert.ok(dsDTerrLabel.includes('по вашему дозиметру'), 'терр: по вашему дозиметру');

  const { text } = await summary(data, input, { dwellU: 0.12 });
  assert.ok(text.includes('заменено, а не прибавлено'), 'текст: заменено, а не прибавлено');
});

test('FR-91 v29: без записи о медицине сектора нет, остальные на месте', async () => {
  const dataNoMed = without(['med_percaput_world']);
  const { ds: dsM } = slicesOf(dataNoMed, ADULT());

  assert.ok(!dsM.slices.some(s => s.id === 'medicine'), 'нет medicine');
  assert.equal(dsM.slices.length, 7, '7 срезов');

  const { text: tNoMed } = await summary(dataNoMed, ADULT());
  assert.ok(!tNoMed.includes('Медицинская диагностика'), 'нет сектора медицинской диагностики');

  const { text: tMed } = await summary(data, ADULT());
  assert.ok(tMed.includes('Медицинская диагностика (средняя доза на жителя)'), 'есть сектор медицины');
  assert.ok(tMed.includes('уже входят обычные снимки'), 'есть примечание о снимках');
});

test('FR-91 v29: поля частоты на вкладке «Сравнение» и общее состояние', async () => {
  const input = ADULT();
  const result = computeScenario(data, input);
  const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'cmp' });
  const text = norm(html);

  assert.ok(text.includes('Дополнительных снимков грудной клетки в год'), 'есть поле xray');
  assert.ok(text.includes('Перелётов по 3 ч в год'), 'есть поле flight');
  assert.ok(html.includes('id="xrayN"'), 'есть id="xrayN"');
  assert.ok(html.includes('id="flightN"'), 'есть id="flightN"');

  const src = readFileSync('src/react/Result.jsx', 'utf8');
  assert.match(src, /<SummaryTab[^>]*xrayN=\{xrayN\}[^>]*flightN=\{flightN\}/);
  assert.match(src, /<Compare[^>]*setXrayN=\{setXrayN\}[^>]*setFlightN=\{setFlightN\}/);
});

test('FR-91 v29: диаграммы крупнее, заголовки колонок короткие', async () => {
  const { html, text } = await summary(data, ADULT());

  const count = html.split('viewBox="0 -28 600 428"').length - 1; // #FR-99: поле сверху под выноску «Питание…»
  assert.equal(count, 2, 'две диаграммы с viewBox 600x400');

  assert.ok(html.includes('Риск смерти (на 1 млн)'), 'есть заголовок "Риск смерти (на 1 млн)"');
  assert.ok(html.includes('Доза; риск (на 1 млн)'), 'есть заголовок "Доза; риск (на 1 млн)"');
  assert.ok(!text.includes('(на миллион человек)'), 'нет длинного заголовка');
  assert.ok(text.includes('«На 1 млн» — на 1 000 000 человек'), 'есть пояснение "На 1 млн"');
});
