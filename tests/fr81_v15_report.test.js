// #FR-81 V15: отчёт — раздел «Итог» состоит из тех же строк, что главный экран (summaryParts), без Ē₅ и без риска «с учётом вреда» (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { buildReport } from '../src/ui/report.js';
import { summaryParts } from '../src/ui/summary_text.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const ISO = '2026-10-06T00:00:00.000Z';
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const S2 = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const S5 = () => inputFor('mushrooms_fresh', 'грибы свежие', [['Cs-137', 400, 40]], { portionKg: 0.3, portionsPerYear: 60, years: 1 });
const report = (input, fmt = 'md') => { const result = computeScenario(data, input); return buildReport(fmt, { input, result }, META, ISO).text; };
const itog = (text) => text.slice(text.indexOf('## Итог'), text.indexOf('## Расчёт по нуклидам'));
const lines = (input) => { const p = summaryParts(computeScenario(data, input), input); return [p.head, p.number, p.caption, p.equiv, p.verbal, ...p.notes, p.link, p.verdict.title, ...p.verdict.lines.map(l => l.text), p.verdict.sep, p.dose.head, ...p.dose.lines].filter(Boolean); };

test('V15: в «Итоге» нет Ē₅, риска «с учётом вреда» и «1 млн»', async () => {
  for (const S of [S1, S2, S5]) {
    const t = itog(report(S()));
    assert.doesNotMatch(t, /Ē₅/);
    assert.doesNotMatch(t, /с учётом вреда/);
    assert.doesNotMatch(t, /на 1 млн/);
  }
});

test('V15: строки «Итога» совпадают со строками главного экрана (md и html, S1, S2, S5)', async () => {
  for (const input of [S1(), S2(), S5()]) {
    const result = computeScenario(data, input);
    const screen = norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META }));
    const md = norm(report(input, 'md'));
    const html = norm(report(input, 'html'));
    for (const s of lines(input)) {
      const n = norm(s).trim();
      assert.ok(screen.includes(n), 'экран: ' + n);
      assert.ok(md.includes(n), 'md: ' + n);
      assert.ok(html.includes(n), 'html: ' + n);
    }
  }
});
