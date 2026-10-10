import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { radonRisk } from '../src/vendor/radon_risk/radonRisk.mjs';
import { radonLungSub, radonSubShares } from '../src/calc/cancer_sub.js';
import { startAge } from '../src/calc/compare.js';
import { riskSlices, linearAngles } from '../src/calc/summary_charts.js';
import { buildBibliography, plainSource } from '../src/ui/bibliography.js';
import { fmtDose, fmtDose2 } from '../src/ui/fmt.js';
import { T } from '../src/ui/texts_v.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const adult = () => inputFor('milk','молоко',[['Cs-137',100,10]],{portionKg:0.5,portionsPerYear:365,years:1});
const child = () => inputFor('milk','молоко',[['Cs-137',100,10]],{age:'5y',portionKg:0.5,portionsPerYear:365,years:1});
const both = () => inputFor('milk','молоко',[['Cs-137',4400,10],['Sr-90',100,10]],{portionKg:1.05,portionsPerYear:1,years:1});
const run = (input) => ({ input, result: computeScenario(data, input) });
const tabText = async ({input,result}, initialTab) => norm(await renderJsx('src/react/Result.jsx','default',{ result, input, meta: META, initialTab }));
const sumHtml = async ({input,result}, radonC = 200) => renderJsx('src/react/SummaryTab.jsx','default',{ result, input, radonC });
const figRisk = (html) => html.match(/data-chart="risk"[^]*?<\/figure>/)[0];

test('FR-99 Б-1: подпись диаграммы (а) не отрицает снимки и перелёты', async () => {
    assert.ok(!T.SUM_CHART_A_NOTE.includes('не входят'), 'T.SUM_CHART_A_NOTE не должен содержать "не входят"');
    assert.ok(T.SUM_CHART_A_NOTE.includes('входят в диаграмму'), 'T.SUM_CHART_A_NOTE должен содержать "входят в диаграмму"');
    
    const a = run(adult());
    const html = await sumHtml(a);
    const figDose = html.match(/data-chart="dose"[^]*?<\/figure>/)[0];
    assert.ok(figDose.includes('Авиаперелёты'), 'Диаграмма дозы должна содержать "Авиаперелёты"');
    assert.ok(figDose.includes('Рентгенография и флюорография'), 'Диаграмма дозы должна содержать сектор рентгенографии (#FR-101)');
});

test('FR-99 Б-2: в круге нет подсектора и штриховки курящего', async () => {
    const a = run(adult());
    const html = await sumHtml(a);
    const fig = figRisk(html);
    
    assert.ok(!fig.includes('pie-sub-hatch'), 'Не должно быть pie-sub-hatch');
    assert.ok(!fig.includes('risk-hatch'), 'Не должно быть risk-hatch');
    assert.ok(!fig.includes('radon_smoker_add'), 'Не должно быть radon_smoker_add');
    assert.ok(!fig.includes('<pattern id="risk-hatch"'), 'Не должно быть <pattern штриховки курящего'); // #FR-98: pattern точек (risk-dots-N) — для подсекторов воздуха

    const innerGroups = fig.match(/<g data-inner="radon_/g);
    assert.equal(innerGroups.length, 1, 'Должен быть ровно один подсектор радона');
    assert.ok(fig.includes('data-inner="radon_never"'), 'Единственный inner должен быть radon_never');
});

test('FR-99 Б-2: угол подсектора = радон некурящего, пересчитанный на горизонт круга (до b лет), а не «к 75»', async () => {
    const a = run(adult());
    const { input, result } = a;
    const rs = riskSlices(result.lifeRisks);
    const s = startAge(input);
    
    const never = radonRisk({C:200, years: rs.H, ageStart: s, smoking:'never'}).darby.excess;
    const expectedShare = never * ((rs.b - s) / (75 - s)) / rs.total;
    const expectedAngle = expectedShare * 360;
    
    const html = await sumHtml(a);
    const fig = figRisk(html);
    
    const match = fig.match(/<g data-inner="radon_never"[^>]*data-a0="([^"]+)"[^>]*data-a1="([^"]+)"/);
    assert.ok(match, 'Не найден <g data-inner="radon_never" с data-a0 и data-a1');
    
    const a0 = parseFloat(match[1]);
    const a1 = parseFloat(match[2]);
    const actualAngle = a1 - a0;
    
    assert.ok(Math.abs(actualAngle - expectedAngle) < 0.02, `Угол ${actualAngle} должен быть близок к ${expectedAngle} (допуск 0.02)`);
    
    const wrongAngle = (never / rs.total) * 360;
    assert.ok(Math.abs(actualAngle - wrongAngle) > 0.03, `Угол ${actualAngle} должен отличаться от ${wrongAngle} (горизонт 75) более чем на 0.03`);
});

test('FR-99 Б-2: радон некурящего не больше смертей от рака лёгкого за тот же срок', async () => {
    const a = run(adult());
    const { input, result } = a;
    const rs = riskSlices(result.lifeRisks);
    
    const sub = radonLungSub(input, rs.H, 200, rs.b);
    
    const refs = result.lifeRisks.lifetime.refs;
    const ref1034 = refs.find(r => r.code === '1034');
    assert.ok(ref1034, 'Не найдена ссылка с кодом 1034');
    
    assert.ok(sub.neverB < ref1034.p, `neverB (${sub.neverB}) должно быть меньше p (${ref1034.p})`);
    
    const badCase = radonSubShares({neverB: 0.5}, 0.014, 1);
    assert.equal(badCase.bad, true, 'radonSubShares с neverB=0.5 должно быть bad=true');
    
    const goodCase = radonSubShares({neverB: 0.001}, 0.014, 1);
    assert.equal(goodCase.bad, false, 'radonSubShares с neverB=0.001 должно быть bad=false');
    
    const html = await sumHtml(a);
    assert.ok(!html.includes('id="sumSubBad"'), 'HTML не должен содержать id="sumSubBad"');
});

test('FR-99 Б-2: курящий — строкой текста, для ребёнка не показывается', async () => {
    const a = run(adult());
    const { input, result } = a;
    const rs = riskSlices(result.lifeRisks);
    
    const sub = radonLungSub(input, rs.H, 200, rs.b);
    const ratioStr = String(Math.round(sub.ratio));
    
    const html = await sumHtml(a);
    assert.ok(html.includes('id="sumSubSmoke"'), 'HTML adult должен содержать id="sumSubSmoke"');
    
    const text = norm(html);
    assert.ok(text.includes('примерно в'), 'Текст должен содержать "примерно в"');
    assert.ok(text.includes(ratioStr), `Текст должен содержать "${ratioStr}"`);
    assert.ok(text.includes('раз выше'), 'Текст должен содержать "раз выше"');
    assert.ok(text.includes('Darby'), 'Текст должен содержать "Darby"');
    
    const c = run(child());
    const htmlChild = await sumHtml(c);
    assert.ok(!htmlChild.includes('id="sumSubSmoke"'), 'HTML child не должен содержать id="sumSubSmoke"');
    
    const figChild = figRisk(htmlChild);
    assert.ok(figChild.includes('data-inner="radon_never"'), 'У ребёнка должен быть подсектор radon_never');
});

test('FR-99 Б-3: срок назван явно', async () => {
    const a = run(adult());
    const text = await tabText(a, 'sum');
    
    assert.ok(text.includes('с 20 до 70 лет'), 'Текст должен содержать "с 20 до 70 лет"');
    assert.ok(text.includes('всю оставшуюся жизнь'), 'Текст должен содержать "всю оставшуюся жизнь"');
    assert.ok(text.includes('без границы по возрасту'), 'Текст должен содержать "без границы по возрасту"');
    assert.ok(!text.includes('Риск смерти за всю жизнь'), 'Текст не должен содержать "Риск смерти за всю жизнь"');
});

test('FR-99 единое округление дозы', async () => {
    const a = run(adult());
    const { result } = a;
    const textSum = await tabText(a, 'sum');
    
    const D = fmtDose(result.totals.doseMaxYearTech), D2 = fmtDose2(result.totals.doseMaxYearTech);
    const countD = textSum.split(D).length - 1;
    assert.ok(countD >= 2, `В тексте sum должно быть не менее 2 вхождений "${D}" (доза за год и «самого нагруженного года»), найдено: ${countD}`);
    assert.ok(D2 === D || !textSum.includes(`(${D2} за год)`), `Текст sum не должен округлять ту же дозу иначе: "${D2}"`);
    
    const textCalc = await tabText(a, 'calc');
    const expectedLine = `Наибольшая средняя доза за 5 лет подряд: ${fmtDose(result.totals.doseTechAvg5)}`;
    assert.ok(textCalc.includes(expectedLine), `Текст calc должен содержать: "${expectedLine}"`);
});

test('FR-99 Источники: полнота списка', async () => {
    const a = run(adult());
    const bib = buildBibliography(a.result);
    
    const ids = ['OSPORB2010','ICRP103_ru','HPS_PS010','ICRP147','DDEP','ICRP126','IRSN_PSE2018','ICRP137','DARBY2005','NRB2009'];
    
    for (const id of ids) {
        const plain = plainSource(id);
        const count = bib.filter(entry => entry.text === plain).length;
        assert.equal(count, 1, `Для id ${id} должно быть ровно 1 запись с текстом "${plain}", найдено: ${count}`);
    }
    
    const b = run(both());
    const bibBoth = buildBibliography(b.result);
    const fdaCount = bibBoth.filter(entry => entry.text.startsWith('FDA CPG Sec. 555.880')).length;
    assert.ok(fdaCount <= 1, `Для both() записей с текстом, начинающимся с "FDA CPG Sec. 555.880", не должно быть больше 1, найдено: ${fdaCount}`);
});

test('FR-99 Ссылка «Происхождение чисел» исправлена', async () => {
    const a = run(adult());
    const text = await tabText(a, 'calc');
    
    assert.ok(text.includes('Значения величин и их источники'), 'Текст calc должен содержать "Значения величин и их источники"');
    assert.ok(!text.includes('Происхождение чисел'), 'Текст calc не должен содержать "Происхождение чисел"');
});

test('FR-99 Мусорная пунктуация и грамматика', async () => {
    const a = run(adult());
    const textSum = await tabText(a, 'sum');
    
    assert.ok(!/—\s*\.\s*[A-Z]/.test(textSum), 'Текст sum не должен соответствовать /—\s*\.\s*[A-Z]/');
    assert.ok(!textSum.includes('2010. 2008'), 'Текст sum не должен содержать "2010. 2008"');
    assert.ok(textSum.includes('Источник:'), 'Текст sum должен содержать "Источник:"');
    
    const textNorms = await tabText(a, 'norms');
    assert.ok(!textNorms.includes('за до 70'), 'Текст norms не должен содержать "за до 70"');
    assert.ok(!textSum.includes('за до 70'), 'Текст sum не должен содержать "за до 70"');
});

test('FR-99 Нет слова «библиотек» в текстах интерфейса', async () => {
    const values = Object.values(T);
    for (const v of values) {
        if (typeof v === 'string') {
            assert.ok(!/библиотек/i.test(v), `Значение T содержит "библиотек": ${v}`);
        }
    }
    
    const a = run(adult());
    const textSum = await tabText(a, 'sum');
    assert.ok(!textSum.includes('библиотек'), 'Текст sum не должен содержать "библиотек"');
    
    const textLife = await tabText(a, 'life');
    assert.ok(!textLife.includes('библиотек'), 'Текст life не должен содержать "библиотек"');
});

test('FR-99 360 px и выноска', () => {
    const css = readFileSync('src/ui/charts.css', 'utf-8');
    assert.ok(css.includes('max-width: min(30rem, 100%)'), 'CSS должен содержать "max-width: min(30rem, 100%)"');
    
    const pie = readFileSync('src/react/Pie.jsx', 'utf-8');
    assert.ok(pie.includes('viewBox="0 -28 600 428"'), 'Pie.jsx должен содержать "viewBox=\"0 -28 600 428\""');
});
