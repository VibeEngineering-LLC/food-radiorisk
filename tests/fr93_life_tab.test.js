import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { riskSlices } from '../src/calc/summary_charts.js';
import { horizonYears } from '../src/calc/compare.js';
import { makeLifeTable, causeProb } from '../src/calc/life_table.js';
import { lifetimeRows, SHOWN_CODES } from '../src/calc/life_lifetime.js';
import { NOMINAL_AGE } from '../src/calc/years.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const close = (x, y, rel) => Math.abs(x - y) <= rel * Math.max(Math.abs(x), Math.abs(y), 1e-300);
const ADULT = () => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const CHILD = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const TABLE = makeLifeTable(data.life_risks);
const startOf = (input) => input.lifetime ? input.lifetime.fromAge : NOMINAL_AGE[input.age];
const lifeTab = async (input) => { const result = computeScenario(data, input); const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'life' }); return { result, html, text: norm(html) }; };
const summary = async (input) => { const result = computeScenario(data, input); const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: 100 }); return { result, html }; };

test('FR-93: горизонт вкладки и диаграммы — H, а не срок питания', async () => {
    for (const input of [ADULT(), CHILD()]) {
        const { result, text } = await lifeTab(input);
        const H = horizonYears(input);
        const a = startOf(input);
        const lt = result.lifeRisks.lifetime;
        assert.equal(lt.H, H);
        assert.equal(lt.a, a);
        assert.equal(lt.b, a + H);
        for (const row of lt.rows) {
            if (row.kind === 'cause') {
                assert.ok(close(row.p, causeProb(TABLE, row.code, a, a + H), 1e-9));
            }
        }
        assert.ok(text.includes(`Бытовые риски за ${H} `));
        assert.ok(text.includes(`За ${H} лет, на 1 млн`));
        if (input === CHILD()) {
            assert.notEqual(result.period.years, H);
        }
    }
});

test('FR-93: набор строк = все записи cause_shares из данных, без пересечений', async () => {
    const codes = data.life_risks.filter(r => r.kind === 'cause_shares').map(r => r.code);
    const { result } = await lifeTab(ADULT());
    const lt = result.lifeRisks.lifetime;
    const shownCodes = lt.rows.filter(r => r.kind === 'cause').map(r => r.code);
    const refCodes = lt.refs.map(r => r.code);
    const union = [...shownCodes, ...refCodes].sort();
    assert.deepEqual(union, [...codes].sort());
    for (const code of SHOWN_CODES) {
        assert.ok(codes.includes(code));
    }
    const rowIds = lt.rows.map(r => r.id);
    assert.ok(!rowIds.includes('cs_1000'));
    assert.ok(!rowIds.includes('cs_1034'));
    assert.ok(!rowIds.includes('cs_1095'));
    const refIds = lt.refs.map(r => r.id);
    assert.ok(refIds.includes('ref_1000'));
    assert.ok(refIds.includes('ref_1034'));
    assert.ok(refIds.includes('ref_1095'));
    const ref1034 = lt.refs.find(r => r.id === 'ref_1034');
    assert.equal(ref1034.within, 'cs_1026');
});

test('FR-93: прочие = все причины − показанные, сумма круга = вероятность умереть от всех причин', async () => {
    for (const input of [ADULT(), CHILD()]) {
        const { result } = await lifeTab(input);
        const H = horizonYears(input);
        const a = startOf(input);
        const lt = result.lifeRisks.lifetime;
        const total = causeProb(TABLE, '1000', a, a + H);
        const sumCauses = lt.rows.filter(r => r.kind === 'cause').reduce((s, r) => s + r.p, 0);
        const other = lt.rows.find(r => r.kind === 'other');
        assert.ok(other);
        assert.ok(other.p >= 0);
        assert.equal(lt.otherNegative, false);
        assert.ok(close(sumCauses + other.p, total, 1e-12));
        assert.ok(close(lt.total, total, 1e-12));
        
        const rs = riskSlices(result.lifeRisks);
        const nonProductSum = rs.slices.filter(s => s.id !== 'product').reduce((s, sl) => s + sl.p, 0);
        assert.ok(close(nonProductSum, total, 1e-9));

        const csOther = rs.slices.find(s => s.id === 'cs_other');
        assert.ok(csOther);
        assert.equal(csOther.ci, 11);
        
        const R = result.totals.riskNominal;
        const productSlice = rs.slices.find(s => s.id === 'product');
        assert.ok(close(productSlice.share, R / (total + R), 1e-9));
    }
});

test('FR-93: пересечение кодов — громкая ошибка, не молчаливый ноль', () => {
    const sc = (v) => (Array.isArray(v) ? v.map((x) => x * 0.05) : v * 0.05); // доли по возрастным группам — массивы
    const bad = { ...TABLE, shares: { ...TABLE.shares, '1000': { male: sc(TABLE.shares['1000'].male), female: sc(TABLE.shares['1000'].female) } } };
    const r = lifetimeRows(data.life_risks, bad, 20, 70, 1e-6);
    assert.equal(r.otherNegative, true);
    const otherRow = r.rows.find(row => row.kind === 'other');
    assert.ok(otherRow.p < 0);
});

test('FR-93: шкала линейная, строки по возрастанию, максимум = 100 %', async () => {
    for (const input of [ADULT(), CHILD()]) {
        const { html, result } = await lifeTab(input);
        const tableStart = html.indexOf('class="life-table"');
        const tableEnd = html.indexOf('</table>', tableStart);
        const tableHtml = html.substring(tableStart, tableEnd);
        const tbodyStart = tableHtml.indexOf('<tbody>');
        const tbodyEnd = tableHtml.indexOf('</tbody>');
        const tbodyHtml = tableHtml.substring(tbodyStart, tbodyEnd);
        
        const rows = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
        const widths = [];
        for (const row of rows) {
            const widthMatch = row.match(/width:([\d.]+)%/);
            if (widthMatch) {
                widths.push(parseFloat(widthMatch[1]));
            }
        }
        
        assert.equal(widths.length, rows.length);
        
        for (let i = 1; i < widths.length; i++) {
            assert.ok(widths[i] >= widths[i-1]);
        }
        
        assert.ok(Math.abs(widths[widths.length - 1] - 100) < 1e-6);
        
        const lt = result.lifeRisks.lifetime;
        const mainRows = lt.rows.filter(r => Number.isFinite(r.p)).sort((a, b) => a.p - b.p); // питание, причины и «прочие» — все строки таблицы
        const maxP = mainRows[mainRows.length - 1].p;
        assert.equal(widths.length, mainRows.length);
        for (let i = 0; i < mainRows.length; i++) {
            const expected = (mainRows[i].p / maxP) * 100; // строго линейно: ни логарифма, ни корня
            assert.ok(Math.abs(widths[i] - expected) < 1e-3, `строка ${mainRows[i].id}: ширина ${widths[i]} ≠ ${expected}`);
        }
        
        const cmpMeRow = rows.find(r => r.includes('class="cmp-me"'));
        assert.ok(cmpMeRow);
        
        const firstRow = rows[0];
        const isCmpMeFirst = firstRow.includes('class="cmp-me"');
        if (input === ADULT()) {
             // For adult, it might be first or not, but for child it should likely not be first if there are higher risks
             // The requirement says "for at least one of the two inputs it is not the first row"
             // We check this globally after the loop or just ensure the logic holds.
             // Let's just assert existence here.
        }
    }
    
    // Check the specific condition: for at least one input, cmp-me is not first
    // при реальных низких дозах питание — самая малая строка и стоит первой; при высокой дозе (R больше «пожара») оно встаёт на своё место по величине, а не закреплено первым
    const adultRes = await lifeTab(inputFor('milk', 'молоко', [['Cs-137', 1e5, 0]], { portionKg: 0.5, portionsPerYear: 365, years: 1 }));
    const childRes = await lifeTab(CHILD());
    
    const checkNotFirst = (html) => {
        const tableStart = html.indexOf('class="life-table"');
        const tableEnd = html.indexOf('</table>', tableStart);
        const tableHtml = html.substring(tableStart, tableEnd);
        const tbodyStart = tableHtml.indexOf('<tbody>');
        const tbodyEnd = tableHtml.indexOf('</tbody>');
        const tbodyHtml = tableHtml.substring(tbodyStart, tbodyEnd);
        const rows = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
        if (rows.length === 0) return false;
        return !rows[0].includes('class="cmp-me"');
    };
    
    assert.ok(checkNotFirst(adultRes.html) || checkNotFirst(childRes.html));
});

test('FR-93: заголовки: шкала линейная, без логарифма; причины, а не источники', async () => {
    const { text } = await lifeTab(ADULT());
    assert.ok(text.includes('Шкала (линейная)'));
    assert.ok(!text.includes('логарифм'));
    
    const { html } = await summary(ADULT());
    const riskFigStart = html.indexOf('data-chart="risk"');
    const riskFigEnd = html.indexOf('</figure>', riskFigStart);
    const riskFig = html.substring(riskFigStart, riskFigEnd);
    
    assert.ok(riskFig.includes('<th>Причина</th>'));
    assert.ok(riskFig.includes('Риск смерти (на 1 млн)'));
    
    const doseFigStart = html.indexOf('data-chart="dose"');
    const doseFigEnd = html.indexOf('</figure>', doseFigStart);
    const doseFig = html.substring(doseFigStart, doseFigEnd);
    
    assert.ok(doseFig.includes('<th>Источник</th>'));
});
