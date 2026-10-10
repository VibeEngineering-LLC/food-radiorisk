// #FR-83 W08: главный экран и отчёт — строка о стандартном потреблении, строка «Потребление продукта» (по умолчанию / введено пользователем), JSON несёт diet
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { buildReport } from '../src/ui/report.js';
import { summaryParts } from '../src/ui/summary_text.js';
import { renderJsx } from './render_helper.js';
import { fmtNum } from '../src/ui/fmt.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const ISO = '2026-10-08T00:00:00.000Z';
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const P = data.diet.find(r => r.id === 'diet_bal2025_potato');
const dietBlock = { mode: 'default', id: P.id, group: 'potato', series: P.series, value: P.value, unit: P.unit, year: P.year };
const defIn = () => ({ ...inputFor('vegetables', 'Картофель', [['Cs-137', 100]]), portionKg: P.value, portionsPerYear: 1, diet: dietBlock });
const ownIn = () => ({ ...inputFor('vegetables', 'Картофель', [['Cs-137', 100]]), portionKg: 0.2, portionsPerYear: 50, diet: { mode: 'own' } });
const report = (input, fmt = 'md') => { const result = computeScenario(data, input); return buildReport(fmt, { input, result }, META, ISO).text; };

test('отчёт при умолчании: строка «Потребление продукта» с «по умолчанию», листом ячейки и годом из данных', () => {
    const row = report(defIn()).split(/\r?\n/).find(l => l.includes('Потребление продукта')) || '';
    assert.ok(row.includes('по умолчанию'));
    assert.ok(row.includes(P.loc));
    assert.ok(row.includes(String(P.year)));
    assert.ok(row.includes('баланс Росстата'));
});

test('отчёт при вводе «знаю»: «введено пользователем», строки «по умолчанию» нет', () => {
    const md = report(ownIn());
    assert.ok(md.includes('введено пользователем'));
    assert.ok(md.includes('Потребление продукта'));
    assert.ok(!md.includes('по умолчанию'));
});

test('главный экран при умолчании: первой строкой оговорок — расчёт для стандартного потребления', () => {
    const result = computeScenario(data, defIn());
    const p = summaryParts(result, defIn());
    assert.ok(p.notes[0].includes('Расчёт для стандартного потребления'));
    assert.ok(p.notes[0].includes(fmtNum(P.value)));
    assert.ok(p.notes[0].includes(String(P.year)));

    const ownResult = computeScenario(data, ownIn());
    const ownP = summaryParts(ownResult, ownIn());
    assert.ok(!ownP.notes.some(n => n.includes('Расчёт для стандартного потребления')));
});

test('строка о стандартном потреблении есть на экране и в отчёте (md, html)', async () => {
    const input = defIn();
    const result = computeScenario(data, input);
    const screen = norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META }));
    const line = norm(summaryParts(result, input).notes[0]).trim();
    assert.ok(screen.includes(line));
    assert.ok(norm(report(input, 'md')).includes(line));
    assert.ok(norm(report(input, 'html')).includes(line));
});

test('JSON-отчёт несёт diet во входе и результате', () => {
    const j = JSON.parse(report(defIn(), 'json'));
    assert.equal(j.input.diet.id, P.id);
    assert.equal(j.result.diet.id, P.id);
    assert.equal(j.result.diet.value, P.value);
});
