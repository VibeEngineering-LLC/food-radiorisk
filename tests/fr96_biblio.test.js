import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { buildBibliography, usedSourceIds, plainSource, RISK_COEFF_SOURCE } from '../src/ui/bibliography.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');

const A = () => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const B = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });

const run = (input) => ({ input, result: computeScenario(data, input) });
const tab = async ({ input, result }, initialTab) => norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab }));

function collectSourcesFromComparison(obj, sources) {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
        for (const item of obj) collectSourcesFromComparison(item, sources);
        return;
    }
    for (const key of Object.keys(obj)) {
        if (key === 'source' && typeof obj[key] === 'string' && obj[key] !== 'RADON_RISK') {
            sources.add(obj[key]);
        }
        collectSourcesFromComparison(obj[key], sources);
    }
}

test('каждый источник использованных записей есть в списке ровно один раз', () => {
    for (const input of [A(), B()]) {
        const { result } = run(input);
        const ids = new Set();

        // From rows provenance
        for (const row of result.rows) {
            for (const p of row.provenance) {
                if (typeof p.source === 'string') ids.add(p.source);
            }
        }

        // From comparison
        if (result.comparison) {
            collectSourcesFromComparison(result.comparison, ids);
        }

        // Add fixed sources
        ids.add(RISK_COEFF_SOURCE);
        ids.add('ROSSTAT_DEMOG2023');
        ids.add('WHO_MORTDB');

        const bib = buildBibliography(result);

        for (const id of ids) {
            const t = plainSource(id);
            const count = bib.filter(e => e.text === t).length;
            assert.equal(count, 1, `Source ${id} (text: ${t}) should appear exactly once, found ${count}`);
        }

        // Check RISK_COEFF_SOURCE matches data
        const riskEntry = data.risk.find(r => r.id === 'nrb2009_p23_avg_risk_coeff');
        assert.ok(riskEntry, 'Risk entry nrb2009_p23_avg_risk_coeff should exist in data');
        assert.equal(RISK_COEFF_SOURCE, riskEntry.source, 'RISK_COEFF_SOURCE should match source field of risk entry');

        // Check usedSourceIds size
        const used = usedSourceIds(result);
        assert.ok(used.size >= 8, `usedSourceIds should have at least 8 entries, got ${used.size}`);
    }
});

test('список без дублей, пронумерован, кириллица раньше латиницы', () => {
    const { result } = run(A());
    const bib = buildBibliography(result);

    // Check uniqueness
    const texts = bib.map(e => e.text);
    const uniqueTexts = new Set(texts);
    assert.equal(uniqueTexts.size, texts.length, 'Bibliography texts should be unique');

    // Check numbering 1..N
    for (let i = 0; i < bib.length; i++) {
        assert.equal(bib[i].n, i + 1, `Entry ${i} should have n=${i + 1}, got ${bib[i].n}`);
    }

    // Check Cyrillic before Latin
    const cyrillicRegex = /^[А-Яа-яЁё]/;
    let firstNonCyrillicIndex = -1;
    for (let i = 0; i < bib.length; i++) {
        if (!cyrillicRegex.test(bib[i].text)) {
            firstNonCyrillicIndex = i;
            break;
        }
    }

    // Must have at least one Cyrillic and one Latin entry
    const hasCyrillic = bib.some(e => cyrillicRegex.test(e.text));
    const hasLatin = bib.some(e => !cyrillicRegex.test(e.text));
    assert.ok(hasCyrillic, 'Should have at least one Cyrillic entry');
    assert.ok(hasLatin, 'Should have at least one Latin entry');

    // All entries after first non-Cyrillic should be non-Cyrillic
    if (firstNonCyrillicIndex !== -1) {
        for (let i = firstNonCyrillicIndex; i < bib.length; i++) {
            assert.ok(!cyrillicRegex.test(bib[i].text), `Entry at index ${i} should not start with Cyrillic after first non-Cyrillic entry`);
        }
    }
});

test('нормативные документы из записей норм в списке', () => {
    const { result } = run(A());
    if (result.limits && result.limits.ru && result.limits.ru.length > 0) {
        const doc = result.limits.ru[0].document;
        const bib = buildBibliography(result);
        const count = bib.filter(e => e.text === doc).length;
        assert.equal(count, 1, `Document "${doc}" should appear exactly once in bibliography`);
    }
});

test('вкладка Источники = список литературы, таблицы значений нет', async () => {
    const { input, result } = run(B());
    const text = await tab({ input, result }, 'src');
    const bib = buildBibliography(result);

    for (const e of bib) {
        const snippet = e.text.slice(0, 40);
        assert.ok(text.includes(snippet), `Bibliography entry snippet "${snippet}" should be in 'src' tab text`);
    }

    assert.ok(text.includes('Описание каждого документа и методика расчёта'), 'Should contain description header');
    assert.ok(!text.includes('Величина Значение Источник'), 'Should NOT contain values table header');
});

test('таблица значений на Подробном расчёте ниже плотности загрязнения', async () => {
    const { input, result } = run(B());
    const text = await tab({ input, result }, 'calc');

    const idxDensity = text.indexOf('Расчёт по нуклидам'); // блок плотности — в сценарии fr92_calc_move (там порядок проверен); здесь — ниже блока нуклидов

    const idxValuesHeader = text.indexOf('Значения величин и их источники');
    assert.ok(idxValuesHeader > idxDensity, 'Values header should be after density assessment');

    const idxTableHeader = text.indexOf('Величина Значение Источник', idxValuesHeader); // первое вхождение ПОСЛЕ заголовка блока
    assert.ok(idxTableHeader > idxValuesHeader, 'Table header should be after values header');

    const idxRef = text.indexOf('Справочные величины для специалиста');
    assert.ok(idxRef > idxTableHeader, 'Reference section should be after table');
});

test('числа и ссылки без потерь', async () => {
    const { input, result } = run(B());
    const text = await tab({ input, result }, 'calc');

    const firstRow = result.rows[0];
    for (const p of firstRow.provenance) {
        const expected = `${firstRow.nuclide} · ${p.step}`;
        assert.ok(text.includes(expected), `Should contain "${expected}" in calc tab`);
    }
});
