import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { doseSlices, riskSlices, homeRadonDoseSv, linearAngles, fmtShare } from '../src/calc/summary_charts.js';
// #FR-89 v27: радон-222 + торон мирового фона — из записей данных (UNSCEAR 2008, Annex B, Table 12), а не константа кода
const WORLD_RN_TN_MSV = data.compare.find(r => r.id === 'bg_radon_world').value + data.compare.find(r => r.id === 'bg_thoron_world').value;
import { horizonYears, startAge } from '../src/calc/compare.js';
import { makeLifeTable, causeProb } from '../src/calc/life_table.js';
import { NOMINAL_AGE } from '../src/calc/years.js';
import { radonRisk } from '../src/vendor/radon_risk/radonRisk.mjs';
import { fmtNum } from '../src/ui/fmt.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');

const ADULT = () => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const MULTI = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { portionKg: 0.5, portionsPerYear: 365, years: 10 });
const CHILD = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const NATONLY = () => inputFor('milk', 'молоко', [['Ra-226', 50, 5]], { portionKg: 1, portionsPerYear: 10, years: 1 });

const calc = (input) => ({ input, result: computeScenario(data, input) });

const resultHtml = async (input, initialTab) => {
  const { result } = calc(input);
  return renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab });
};

const summaryHtml = async (input, radonC) => {
  const { result } = calc(input);
  return renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC });
};

const close = (x, y, rel) => Math.abs(x - y) <= rel * Math.max(Math.abs(x), Math.abs(y), 1e-300);

const parseRu = (s) => {
  if (s === '—') return NaN;
  let t = s.replace(/<[^>]+>/g, '').replace(/\s+/g, '').replace(/,/g, '.');
  if (t.includes('·10')) {
    const [mant, expStr] = t.split('·10');
    const supMap = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
    let exp = '';
    for (const ch of expStr) {
      if (supMap[ch] !== undefined) exp += supMap[ch];
    }
    return Number(mant) * Math.pow(10, Number(exp));
  }
  return Number(t);
};

test('FR-89: состав и порядок вкладок', async () => {
  const html = await resultHtml(ADULT());
  const labels = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)].map(m => m[1]);
  assert.equal(labels.length, 6);
  assert.equal(labels[0], 'Сводка');
  assert.equal(labels[1], 'Соответствие нормам');
  assert.equal(labels[2], 'Подробный расчёт');
  assert.equal(labels[3], 'Сравнение с облучением');
  assert.ok(labels[4].startsWith('Бытовые риски'));
  assert.equal(labels[5], 'Источники'); // #FR-92: расчётов на вкладке больше нет
});

test('FR-89: вкладка по умолчанию — Сводка, прежних карточек над вкладками нет', async () => {
  const html = await resultHtml(ADULT());
  const firstTab = html.match(/<button[^>]*role="tab"[^>]*>/);
  assert.ok(firstTab, 'first tab button found');
  assert.ok(firstTab[0].includes('aria-selected="true"'), 'first tab selected');
  assert.ok(html.includes('data-chart="dose"'), 'dose chart present');
  assert.ok(html.includes('data-chart="risk"'), 'risk chart present');
  assert.ok(!html.includes('resblock'), 'no resblock');
  assert.ok(!norm(html).includes('Показатель B'), 'no norm indicator in summary');

  const htmlN = await resultHtml(ADULT(), 'norms');
  assert.ok(norm(htmlN).includes('Соответствие продукта нормам'), 'norms title');
  assert.ok(norm(htmlN).includes('Доза и нормы облучения'), 'norms dose section');
  assert.ok(norm(htmlN).includes('Показатель B'), 'norms indicator B');
  assert.ok(!htmlN.includes('data-chart='), 'no charts in norms tab');

  const htmlX = await resultHtml(ADULT(), 'нет-такой');
  assert.ok(htmlX.includes('data-chart="dose"'), 'fallback to first tab');
});

test('FR-89: диаграмма доз — доли в сумме 100 % и равны входным величинам сравнения на пожизненном горизонте', async () => {
  const scenarios = [ADULT(), MULTI(), CHILD()];
  for (const input of scenarios) {
    const { result } = calc(input);
    const cmp = result.comparison;
    const H = horizonYears(input);
    // Ожидаемый горизонт: 50 для взрослых, 70 - fromAge для детей
    const expectedH = input.lifetime ? 70 - input.lifetime.fromAge : 50;
    assert.equal(H, expectedH, `horizon for ${input.age || 'adult'}`);
    assert.equal(cmp.horizonYears, H);

    const rad = homeRadonDoseSv(input, cmp, 100);
    const expectedRadon = radonRisk({ C: 100, years: H, ageStart: startAge(input), smoking: 'never' }).totalDose_mSv * 1e-3;
    const bgPerYearSv = data.compare.find(r => r.id === 'bg_natural_world').value * 1e-3;
    const expectedProduct = cmp.rows.find(r => r.id === 'product').doseSv;
    // #FR-91 v29: сектора по составляющим, каждая — из записей данных; подробности и сортировка — tests/fr89_v29.test.js
    const rv = (id) => data.compare.find(r => r.id === id).value * 1e-3;
    const expectedBy = { product: expectedProduct, radon: expectedRadon, medicine: rv('med_percaput_world') * H, flights: 2 * rv('flight_3h') * H, xray: 1 * rv('med_chest_xray') * H, cosmic: rv('bg_cosmic_world') * H, terrestrial: (rv('street_external') + rv('bg_terr_indoor_world')) * H, internal: (rv('bg_ingest_world') + rv('bg_inhal_ut_world')) * H };

    const ds = doseSlices(cmp, rad);
    assert.deepEqual(ds.slices.map(s => s.id).sort(), Object.keys(expectedBy).sort());
    const sumExpected = Object.values(expectedBy).reduce((a, b) => a + b, 0);

    ds.slices.forEach((slice) => {
      assert.ok(close(slice.doseSv, expectedBy[slice.id], 1e-9), `slice ${slice.id} dose`);
      assert.ok(close(slice.share, expectedBy[slice.id] / sumExpected, 1e-9), `slice ${slice.id} share`);
      assert.ok(close(slice.riskP, slice.doseSv * cmp.riskCoeff, 1e-9), `slice ${slice.id} risk`);
    });

    const sumShares = ds.slices.reduce((a, s) => a + s.share, 0);
    assert.ok(Math.abs(sumShares - 1) < 1e-12, 'shares sum to 1');
    assert.equal(ds.H, H);
  }
});

test('FR-89: диаграмма рисков — те же причины на горизонте до 70 лет, доли в сумме 100 %', async () => {
  const scenarios = [ADULT(), MULTI(), CHILD()];
  for (const input of scenarios) {
    const { result } = calc(input);
    const H = horizonYears(input);
    const a = input.lifetime ? input.lifetime.fromAge : NOMINAL_AGE[input.age];
    const rs = riskSlices(result.lifeRisks);
    
    assert.equal(rs.H, H);
    assert.equal(rs.a, a);
    assert.equal(rs.b, 70);
    
    const table = makeLifeTable(data.life_risks);
    const codes = ['1026', '1064', '1096', '1097', '1098', '1099', '1100', '1101', '1102'];
    const expectedIds = ['product', ...codes.map(c => 'cs_' + c), 'cs_other'];
    assert.deepEqual(rs.slices.map(s => s.id).sort(), [...expectedIds].sort()); // порядок секторов — по возрастанию риска (v29)
    
    const totalP = result.totals.riskNominal;
    const sumP = rs.slices.reduce((acc, s) => acc + s.p, 0);
    
    rs.slices.forEach((slice, i) => {
      if (slice.id === 'product') {
        assert.ok(close(slice.p, totalP, 1e-12), 'product risk');
      } else if (slice.id === 'cs_other') {
        const shown = codes.reduce((acc, c) => acc + causeProb(table, c, a, a + H), 0);
        assert.ok(close(slice.p, causeProb(table, '1000', a, a + H) - shown, 1e-9), 'прочие = все причины − показанные');
      } else {
        const code = slice.id.slice(3);
        const expectedP = causeProb(table, code, a, a + H);
        assert.ok(close(slice.p, expectedP, 1e-9), `cause ${code} risk`);
      }
      assert.ok(close(slice.share, slice.p / sumP, 1e-9), `slice ${i} share`);
    });
    
    assert.ok(Math.abs(sumP / sumP - 1) < 1e-12, 'shares sum to 1');
    
    // Старые данные не меняются
    assert.equal(result.lifeRisks.b, Math.min(a + result.period.years, 85));
  }
});

test('FR-89: только природные нуклиды — риск питания в диаграмму не входит', async () => {
  const { result } = calc(NATONLY());
  const rs = riskSlices(result.lifeRisks);
  assert.ok(rs === null || !rs.slices.some(s => s.id === 'product'), 'no product slice'); // при одних природных нуклидах бытовых рисков нет вовсе
  
  const html = norm(await summaryHtml(NATONLY(), 100));
  assert.ok(html.includes('словесной оценки нет'), 'natural only label');
});

test('FR-89: радон присутствует в диаграмме доз', async () => {
  const input = ADULT();
  const { result } = calc(input);
  const cmp = result.comparison;
  const H = horizonYears(input);
  
  // Радон 100 Бк/м3
  const html100 = norm(await summaryHtml(input, 100));
  assert.ok(html100.includes('Радон в жилище'), 'radon label 100');
  const raw100 = await summaryHtml(input, 100);
  assert.ok(raw100.includes('data-chart="dose"'), 'dose chart present');
  
  const ds100 = doseSlices(cmp, homeRadonDoseSv(input, cmp, 100));
  const radonSlice = ds100.slices.find(s => s.id === 'radon');
  const expectedRadon = radonRisk({ C: 100, years: H, ageStart: startAge(input), smoking: 'never' }).totalDose_mSv * 1e-3;
  assert.ok(close(radonSlice.doseSv, expectedRadon, 1e-9), 'radon dose 100');
  
  // Радон NaN (среднее по миру)
  const dsNaN = doseSlices(cmp, homeRadonDoseSv(input, cmp, NaN));
  const radonSliceNaN = dsNaN.slices.find(s => s.id === 'radon');
  const expectedWorld = WORLD_RN_TN_MSV * 1e-3 * H;
  assert.ok(close(radonSliceNaN.doseSv, expectedWorld, 1e-9), 'radon dose world');
  assert.ok(radonSliceNaN.label.startsWith('Радон и торон, среднее по миру'));
  
  const htmlNaN = norm(await summaryHtml(input, NaN));
  assert.ok(htmlNaN.includes('Радон и торон, среднее по миру'), 'world radon label');
  
  // Радон 0 и 20000 -> null
  assert.equal(homeRadonDoseSv(input, cmp, 0), null);
  assert.equal(homeRadonDoseSv(input, cmp, 20000), null);
});

test('FR-89: мелкая доля питания различима', async () => {
  // #FR-89: масштаб линейный (решение оператора) — малая доля не раздувается; подробные проверки углов — tests/fr89_linear.test.js
  const angles = linearAngles([1e-6, 0.3, 0.7 - 1e-6]);
  assert.ok(Math.abs(angles[0] - 1e-6 * 360) < 1e-12, 'малая доля не раздута');
  assert.ok(Math.abs(angles.reduce((a, b) => a + b, 0) - 360) < 1e-9, 'sum 360');
  assert.deepEqual(linearAngles([0, 1]), [0, 360]);
  
  // Проверка HTML для дозы
  const input = ADULT();
  const { result } = calc(input);
  const cmp = result.comparison;
  const ds = doseSlices(cmp, homeRadonDoseSv(input, cmp, 100));
  const productShare = ds.slices.find(s => s.id === 'product').share;
  
  const rawHtml = await summaryHtml(input, 100);
  const doseMatch = rawHtml.match(/data-chart="dose"[\s\S]*?<\/figure>/);
  assert.ok(doseMatch, 'dose figure found');
  const dosePart = doseMatch[0];
  
  const pieCount = (dosePart.match(/class="pie-sl/g) || []).length;
  assert.equal(pieCount, 8, '8 секторов: питание, радон, медицина, перелёты, снимки, космическое, земля, внутреннее');
  
  assert.ok(dosePart.includes(`Питание (молоко): ${fmtShare(productShare)}`), 'product label with share');
  assert.ok(dosePart.includes('pie-me'), 'pie-me present');
  
  // Проверка HTML для риска
  const riskMatch = rawHtml.match(/data-chart="risk"[\s\S]*?<\/figure>/);
  assert.ok(riskMatch, 'risk figure found');
  const riskPart = riskMatch[0];
  
  const riskPieCount = (riskPart.match(/class="pie-sl pie-s\d/g) || []).length; // #FR-97: подсектора (pie-sub) — не сектора круга
  assert.equal(riskPieCount, 11, '11 секторов: питание + 9 причин + прочие');
  assert.ok(riskPart.includes('Питание (молоко): '), 'risk product label with product name');
});

test('FR-89: подробный расчёт — доза собирается из показанных чисел', async () => {
  const scenarios = [ADULT(), MULTI(), CHILD()];
  
  for (const input of scenarios) {
    const { result } = calc(input);
    const html = await resultHtml(input, 'calc');
    
    // Количество fieldset'ов
    const fieldsetCount = (html.match(/class="rgroup detail-nuclide"/g) || []).length;
    assert.equal(fieldsetCount, result.rows.length, 'fieldset count');
    
    let sumShownTotals = 0;
    
    for (const row of result.rows) {
      const nuclide = row.nuclide;
      const startIdx = html.indexOf(`class="rgroup detail-nuclide" data-nuclide="${nuclide}"`);
      assert.ok(startIdx !== -1, `fieldset for ${nuclide}`);
      const endIdx = html.indexOf('</fieldset>', startIdx);
      const block = html.substring(startIdx, endIdx);
      
      // (a) Таблица шагов
      const aMatch = block.match(/<td>A — активность[^<]*<\/td><td class="num">([^<]*)</);
      const frMatch = block.match(/<td>Fr — доля[^<]*<\/td><td class="num">([^<]*)</);
      const mMatch = block.match(/<td>M — масса[^<]*<\/td><td class="num">([^<]*)</);
      const i0Match = block.match(/<td>I₀ = A · Fr · M[^<]*<\/td><td class="num">([^<]*)</);
      
      assert.ok(aMatch && frMatch && mMatch && i0Match, 'step table values found');
      
      const A = parseRu(aMatch[1]);
      const Fr = parseRu(frMatch[1]);
      const M = parseRu(mMatch[1]);
      const I0 = parseRu(i0Match[1]);
      
      assert.ok(close(A * Fr * M, I0, 0.02), `I0 = A*Fr*M for ${nuclide}`);
      
      // (b) Таблица лет
      const yearsIdx = block.indexOf('class="detail-years"');
      assert.ok(yearsIdx !== -1, 'years table found');
      const tbodyStart = block.indexOf('<tbody>', yearsIdx);
      const tbodyEnd = block.indexOf('</tbody>', tbodyStart);
      const tbody = block.substring(tbodyStart, tbodyEnd);
      
      const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
      assert.equal(rows.length, row.yearly.length, `years rows for ${nuclide}`);
      
      let doseFromShown = 0;
      let doseFromChain = 0;
      let sumEk = 0;
      
      for (const r of rows) {
        const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
        const w = parseRu(cells[3]);
        const d = parseRu(cells[4]);
        const Ik = parseRu(cells[5]);
        const ek = parseRu(cells[6]);
        const Ek = parseRu(cells[7]);
        
        doseFromShown += Ik * ek;
        doseFromChain += I0 * w * d * ek;
        sumEk += Ek;
      }
      
      assert.ok(close(doseFromShown, row.doseSvTotal, 0.01), `dose from shown for ${nuclide}`);
      assert.ok(close(doseFromChain, row.doseSvTotal, 0.02), `dose from chain for ${nuclide}`);
      assert.ok(close(sumEk, row.doseSvTotal, 0.01), `sum Ek for ${nuclide}`);
      
      // (c) Итоговая строка
      const eMatch = block.match(/E = Σ E_k = ([^ ]+(?: ?·10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?) Зв/);
      assert.ok(eMatch, 'E total line found');
      const eTotal = parseRu(eMatch[1]);
      assert.ok(close(eTotal, row.doseSvTotal, 0.01), `E total for ${nuclide}`);
      
      sumShownTotals += row.doseSvTotal;
    }
    
    // Сумма доз по нуклидам
    assert.ok(close(sumShownTotals, result.totals.doseSvTotal, 0.01), 'sum of nuclide doses');
    
    // Блок итога
    const totalIdx = html.indexOf('detail-total');
    assert.ok(totalIdx !== -1, 'total block found');
    const totalEnd = html.indexOf('</fieldset>', totalIdx);
    const totalBlock = html.substring(totalIdx, totalEnd);
    
    assert.ok(totalBlock.includes('НРБ-99/2009, п. 2.3'), 'NRPB reference');
    assert.ok(totalBlock.includes(`Коэффициент риска r = ${fmtNum(result.comparison.riskCoeff)}`), 'risk coeff');
    
    if (result.totals.riskNominal != null) {
      assert.ok(norm(html).includes('R = r · E(техногенные)'), 'risk formula');
    }
    
    // Количество таблиц лет
    const yearsTableCount = (html.match(/class="detail-years"/g) || []).length;
    assert.equal(yearsTableCount, result.rows.length, 'years table count');
    
    // Дополнительно для MULTI: Cs-137 10 строк, Sr-90 распад
    if (input === MULTI()) {
      const csIdx = html.indexOf('data-nuclide="Cs-137"');
      const csEnd = html.indexOf('</fieldset>', csIdx);
      const csBlock = html.substring(csIdx, csEnd);
      const csTbodyStart = csBlock.indexOf('<tbody>');
      const csTbodyEnd = csBlock.indexOf('</tbody>', csTbodyStart);
      const csTbody = csBlock.substring(csTbodyStart, csTbodyEnd);
      const csRows = [...csTbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      assert.equal(csRows.length, 10, 'Cs-137 10 rows');
      
      const firstRowCells = [...csRows[0][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
      const firstD = parseRu(firstRowCells[4]);
      assert.ok(firstD >= 0.99 && firstD <= 1, 'Cs-137 first d ~ 1');
      
      const srIdx = html.indexOf('data-nuclide="Sr-90"');
      const srEnd = html.indexOf('</fieldset>', srIdx);
      const srBlock = html.substring(srIdx, srEnd);
      const srTbodyStart = srBlock.indexOf('<tbody>');
      const srTbodyEnd = srBlock.indexOf('</tbody>', srTbodyStart);
      const srTbody = srBlock.substring(srTbodyStart, srTbodyEnd);
      const srRows = [...srTbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      
      const srFirstCells = [...srRows[0][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
      const srLastCells = [...srRows[srRows.length - 1][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
      const srFirstD = parseRu(srFirstCells[4]);
      const srLastD = parseRu(srLastCells[4]);
      assert.ok(srLastD < srFirstD, 'Sr-90 decay: last d < first d');
    }
  }
});
