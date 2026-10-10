import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { airAttrib } from '../src/calc/air_attrib.js';
import { makeLifeTable, causeProb } from '../src/calc/life_table.js';
import { riskSlices, linearAngles } from '../src/calc/summary_charts.js';
import { buildBibliography } from '../src/ui/bibliography.js';

const input = inputFor('milk','молоко',[['Cs-137',100,10]],{portionKg:0.5,portionsPerYear:365,years:1});
const result = computeScenario(data, input);
const lt = result.lifeRisks.lifetime;
const air = lt.air;
const rs = riskSlices(result.lifeRisks);
const recs = data.life_risks.filter(r => r.region !== 'world'); // #FR-101: воздух — только набор «Россия»
const val = (id) => recs.find(r => r.id === id);
const table = makeLifeTable(recs);
const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: 200 });
const fig = html.match(/data-chart="risk"[^]*?<\/figure>/)[0];
const inner = [...fig.matchAll(/<g data-inner="([^"]+)" data-a0="([-\d.]+)" data-a1="([-\d.]+)">([^]*?)<\/g>/g)].map(m => ({ id: m[1], a0: +m[2], a1: +m[3], body: m[4] }));
const angles = linearAngles(rs.slices.map(s => s.share));
let acc = -90; const sect = Object.fromEntries(rs.slices.map((s, i) => { const o = { start: acc, end: acc + angles[i] }; acc += angles[i]; return [s.id, o]; }));

test('FR-98 данные: пять записей воздуха с источником, цитатой и регионом ru', () => {
    const ids = ['air_copd', 'air_ihd', 'air_stroke', 'air_lung', 'air_diabetes'];
    const expectedValues = {
        air_copd: 0.25,
        air_ihd: 0.10,
        air_stroke: 0.07,
        air_lung: 0.10,
        air_diabetes: 0.19
    };
    const expectedLocs = {
        air_copd: '1076',
        air_ihd: '1067',
        air_stroke: '1069',
        air_lung: '1034'
    };

    for (const id of ids) {
        const rec = val(id);
        assert.ok(rec, `Record ${id} not found`);
        assert.equal(rec.value, expectedValues[id], `Value mismatch for ${id}`);
        assert.equal(rec.region, 'ru', `Region mismatch for ${id}`);
        assert.equal(rec.source, 'HEI_SOGA2019', `Source mismatch for ${id}`);
        assert.equal(rec.year, 2017, `Year mismatch for ${id}`);
        assert.equal(rec.level, '⚠️', `Level mismatch for ${id}`);
        
        assert.ok(typeof rec.quote === 'string' && rec.quote.length > 0, `Quote empty for ${id}`);
        assert.ok(rec.quote.includes('percent of'), `Quote missing 'percent of' for ${id}`);
        
        assert.ok(rec.loc.includes('Russian Federation'), `Loc missing 'Russian Federation' for ${id}`);
        
        if (expectedLocs[id]) {
             assert.ok(rec.method.includes(expectedLocs[id]), `Method missing code ${expectedLocs[id]} for ${id}`); // код списка 101 указан в method (loc — место числа в листке)
        }
    }
});

test('FR-98 подсектор = доля × вероятность причины на горизонте', () => {
    const airGroups = air.groups;
    
    const findGroup = (id) => airGroups.find(g => g.id === id);
    
    const gCirc = findGroup('air_circ');
    const gLung = findGroup('air_lung');
    const gCOPD = findGroup('air_copd');
    
    assert.ok(gCirc, 'air_circ group not found');
    assert.ok(gLung, 'air_lung group not found');
    assert.ok(gCOPD, 'air_copd group not found');

    const pCirc = 0.10 * causeProb(table, '1067', lt.a, lt.b) + 0.07 * causeProb(table, '1069', lt.a, lt.b);
    assert.ok(Math.abs(gCirc.p - pCirc) / pCirc < 1e-12, `air_circ p mismatch: ${gCirc.p} vs ${pCirc}`);

    const pLung = 0.10 * causeProb(table, '1034', lt.a, lt.b);
    assert.ok(Math.abs(gLung.p - pLung) / pLung < 1e-12, `air_lung p mismatch: ${gLung.p} vs ${pLung}`);

    const pCOPD = 0.25 * causeProb(table, '1076', lt.a, lt.b);
    assert.ok(Math.abs(gCOPD.p - pCOPD) / pCOPD < 1e-12, `air_copd p mismatch: ${gCOPD.p} vs ${pCOPD}`);
});

test('FR-98 подсектора лежат внутри своих секторов', () => {
    const innerCirc = inner.find(i => i.id === 'air_circ');
    const innerLung = inner.find(i => i.id === 'air_lung');
    const innerCOPD = inner.find(i => i.id === 'air_copd');
    
    assert.ok(innerCirc, 'air_circ inner not found');
    assert.ok(innerLung, 'air_lung inner not found');
    assert.ok(innerCOPD, 'air_copd inner not found');

    // air_circ inside cs_1064
    assert.ok(innerCirc.a0 >= sect.cs_1064.start - 0.02, `air_circ start out of bounds: ${innerCirc.a0} < ${sect.cs_1064.start}`);
    assert.ok(innerCirc.a1 <= sect.cs_1064.end + 0.02, `air_circ end out of bounds: ${innerCirc.a1} > ${sect.cs_1064.end}`);

    // air_copd inside cs_other
    assert.ok(innerCOPD.a0 >= sect.cs_other.start - 0.02, `air_copd start out of bounds: ${innerCOPD.a0} < ${sect.cs_other.start}`);
    assert.ok(innerCOPD.a1 <= sect.cs_other.end + 0.02, `air_copd end out of bounds: ${innerCOPD.a1} > ${sect.cs_other.end}`);

    // air_lung inside cs_1026
    assert.ok(innerLung.a0 >= sect.cs_1026.start - 0.02, `air_lung start out of bounds: ${innerLung.a0} < ${sect.cs_1026.start}`);
    assert.ok(innerLung.a1 <= sect.cs_1026.end + 0.02, `air_lung end out of bounds: ${innerLung.a1} > ${sect.cs_1026.end}`);

    // air_lung starts where radon_never ends
    const innerRadon = inner.find(i => i.id === 'radon_never');
    assert.ok(innerRadon, 'radon_never inner not found');
    
    assert.ok(Math.abs(innerLung.a0 - innerRadon.a1) < 0.02, `air_lung start ${innerLung.a0} not close to radon_never end ${innerRadon.a1}`);

    // Sum of angles radon_never + air_lung <= angle of cs_1026
    const angleRadon = innerRadon.a1 - innerRadon.a0;
    const angleLung = innerLung.a1 - innerLung.a0;
    const angleSector = sect.cs_1026.end - sect.cs_1026.start;
    
    assert.ok(angleRadon + angleLung <= angleSector + 0.02, `Sum of radon+lung angles ${angleRadon + angleLung} exceeds sector angle ${angleSector}`);
});

test('FR-98 углы линейны: угол = p / итог круга × 360°', () => {
    const airGroups = air.groups;
    for (const g of airGroups) {
        const innerG = inner.find(i => i.id === g.id);
        assert.ok(innerG, `Inner for ${g.id} not found`);
        
        const expectedAngle = (g.p / rs.total) * 360;
        const actualAngle = innerG.a1 - innerG.a0;
        
        assert.ok(Math.abs(actualAngle - expectedAngle) < 0.02, `Angle mismatch for ${g.id}: ${actualAngle} vs ${expectedAngle}`);
    }
});

test('FR-98 не прибавлено к сумме', () => {
    const mainSectors = fig.match(/<path class="pie-sl pie-s\d/g);
    assert.ok(mainSectors, 'No main sectors found');
    assert.equal(mainSectors.length, rs.slices.length, `Number of main sectors ${mainSectors.length} != slices ${rs.slices.length}`);

    const sumShare = rs.slices.reduce((sum, s) => sum + s.share, 0);
    assert.ok(Math.abs(sumShare - 1) < 1e-9, `Sum of shares ${sumShare} != 1`);

    const sumAngles = rs.slices.reduce((sum, s, i) => sum + angles[i], 0);
    assert.ok(Math.abs(sumAngles - 360) < 1e-9, `Sum of angles ${sumAngles} != 360`);
});

test('FR-98 другая текстура: точки', () => {
    assert.ok(fig.includes('<pattern id="risk-dots-'), 'Pattern risk-dots not found');
    assert.ok(fig.includes('pie-dots-dot'), 'Class pie-dots-dot not found');

    const innerLung = inner.find(i => i.id === 'air_lung');
    assert.ok(innerLung, 'air_lung inner not found');
    assert.ok(innerLung.body.includes('fill="url(#risk-dots-'), 'air_lung does not use dots pattern');
    assert.ok(innerLung.body.includes('pie-air'), 'air_lung does not have pie-air class');

    const innerRadon = inner.find(i => i.id === 'radon_never');
    assert.ok(innerRadon, 'radon_never inner not found');
    assert.ok(!innerRadon.body.includes('url(#'), 'radon_never should not use url() fill');
});

test('FR-98 подпись «Россия, 2017», легенда и подсказки', () => {
    assert.ok(html.includes('id="sumAirNote"'), 'sumAirNote id not found');
    
    // Extract text content of sumAirNote roughly
    const noteMatch = html.match(/id="sumAirNote"[^]*?<\/div>/);
    assert.ok(noteMatch, 'sumAirNote content not found');
    const noteText = noteMatch[0].replace(/<[^>]+>/g, '');
    
    assert.ok(noteText.includes('Россия, 2017'), 'Note missing "Россия, 2017"');
    assert.ok(noteText.includes('перекрываются и не складываются'), 'Note missing "перекрываются и не складываются"');
    assert.ok(noteText.includes('допущение'), 'Note missing "допущение"');

    // Legend checks
    assert.ok(html.includes('data-sub="air_circ"'), 'Legend air_circ not found');
    assert.ok(html.includes('data-sub="air_lung"'), 'Legend air_lung not found');
    assert.ok(html.includes('data-sub="air_copd"'), 'Legend air_copd not found');
    
    // Check if legend text contains "от загрязнения воздуха"
    // We assume the legend items are near these data-sub attributes
    const legendMatch = html.match(/data-sub="air_circ"[^]*?<\/li>/);
    if (legendMatch) {
        const legendText = legendMatch[0].replace(/<[^>]+>/g, '');
        assert.ok(legendText.includes('от загрязнения воздуха'), 'Legend air_circ missing "от загрязнения воздуха"');
    } else {
        // Fallback: check if the string exists in the vicinity or generally in the legend section
        // Since we don't have exact structure, we check if the string exists in the HTML near the legend area
        // For strictness, let's just check if the string exists in the HTML at all, as it's a specific phrase
        assert.ok(html.includes('от загрязнения воздуха'), 'Phrase "от загрязнения воздуха" not found in HTML');
    }

    // Title of air_lung
    const innerLung = inner.find(i => i.id === 'air_lung');
    assert.ok(innerLung, 'air_lung inner not found');
    const titleMatch = innerLung.body.match(/<title>([^<]*)<\/title>/);
    assert.ok(titleMatch, 'Title for air_lung not found');
    assert.ok(titleMatch[1].includes('Доли из данных'), `Title for air_lung missing "Доли из данных": ${titleMatch[1]}`);
});

test('FR-98 громкая проверка: подсектор не больше своей причины', async () => {
    // Create modified data
    const d2 = {
        ...data,
        life_risks: data.life_risks.map(r => {
            if (r.id === 'air_ihd' || r.id === 'air_stroke') {
                return { ...r, value: 5 };
            }
            return r;
        })
    };

    const result2 = computeScenario(d2, input);
    const html2 = await renderJsx('src/react/SummaryTab.jsx', 'default', { result: result2, input, radonC: 200 });
    
    assert.ok(html2.includes('id="sumAirBad"'), 'sumAirBad id not found in modified render');
    assert.ok(!html2.includes('data-inner="air_circ"'), 'air_circ inner should not be present in modified render');
});

test('FR-98 список литературы', () => {
    const bib = buildBibliography(result);
    const entries = bib.filter(e => e.text && e.text.startsWith('Health Effects Institute'));
    assert.equal(entries.length, 1, `Expected exactly one entry starting with "Health Effects Institute", found ${entries.length}`);
});

test('FR-98 набор помечен регионом: без air_attrib подсектора нет', async () => {
    const d3 = {
        ...data,
        life_risks: data.life_risks.filter(r => r.kind !== 'air_attrib')
    };
    
    const result3 = computeScenario(d3, input);
    assert.equal(result3.lifeRisks.lifetime.air, null, 'air should be null when no air_attrib records');
    
    const html3 = await renderJsx('src/react/SummaryTab.jsx', 'default', { result: result3, input, radonC: 200 });
    assert.ok(!html3.includes('data-inner="air_'), 'HTML should not contain air_ inner elements');
});
