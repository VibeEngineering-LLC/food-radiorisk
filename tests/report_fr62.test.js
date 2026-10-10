import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { presetRadGear } from '../src/ui/form.js';
import { FORMATS, buildReport } from '../src/ui/report.js';
import { fmtDose } from '../src/ui/fmt.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const input = presetRadGear();
const result = computeScenario(data, input);
const calc = { input, result };
const meta = { datasets: 3, records: 99, sha: 'abcdef0123456789' };
const ISO = '2026-10-02T12:34:56.000Z';

test('FORMATS ids are exactly [md, html, json] and items have label, ext, mime', () => {
  assert.deepStrictEqual(FORMATS.map(f => f.id), ['md', 'html', 'json']);
  for (const f of FORMATS) {
    assert.ok(f.label && f.label.length > 0, `label should be non-empty for ${f.id}`);
    assert.ok(f.ext && f.ext.length > 0, `ext should be non-empty for ${f.id}`);
    assert.ok(f.mime && f.mime.length > 0, `mime should be non-empty for ${f.id}`);
  }
});

test('Markdown: buildReport md structure and content', () => {
  const res = buildReport('md', calc, meta, ISO);
  assert.strictEqual(res.ext, 'md');
  assert.strictEqual(res.fileName, 'radiorisk-20261002-1234.md');
  assert.ok(res.mime.startsWith('text/markdown'));
  
  const text = res.text;
  assert.ok(text.startsWith('# Доза и риск от радионуклидов в пище'), 'starts with title');
  assert.ok(text.includes('## Расчёт по нуклидам'), 'contains nuclide section');
  assert.ok(text.includes('## Источники чисел'), 'contains sources section');
  assert.match(text, /\|\s*---:?\s*\|/, 'contains GFM separator');
  assert.ok(text.includes(result.rows[0].nuclide), `contains nuclide ${result.rows[0].nuclide}`);
  assert.ok(text.includes('sha abcdef01'), 'contains sha');
  assert.ok(text.endsWith('\n'), 'ends with newline');
  assert.ok(!text.includes('<a '), 'no html links');
  assert.ok(!text.includes('&amp;'), 'no escaped ampersands');
});

test('HTML: buildReport html structure and tags', () => {
  const res = buildReport('html', calc, meta, ISO);
  assert.strictEqual(res.ext, 'html');
  
  const text = res.text;
  assert.ok(text.startsWith('<!doctype html>'), 'starts with doctype');
  assert.ok(text.includes('<meta charset="utf-8">'), 'contains meta charset');
  assert.ok(text.includes('<table>'), 'contains table');
  assert.ok(text.includes('<td class="n">'), 'contains td class n');

  const knownTags = /<\/?(html|head|meta|title|style|body|h1|h2|p|table|thead|tbody|tr|th|td)\b[^>]*>/g;
  const cleaned = text.replace('<!doctype html>', '').replace(knownTags, '');
  assert.ok(!cleaned.includes('<'), 'no unknown tags remaining');
});

test('JSON: buildReport json structure and content', () => {
  const res = buildReport('json', calc, meta, ISO);
  assert.strictEqual(res.ext, 'json');
  
  const parsed = JSON.parse(res.text);
  assert.strictEqual(parsed.generatedAt, ISO);
  assert.deepStrictEqual(parsed.input, JSON.parse(JSON.stringify(input)));
  assert.deepStrictEqual(parsed.data, meta);
});

test('Unknown format id xyz gives same text as md', () => {
  const resMd = buildReport('md', calc, meta, ISO);
  const resXyz = buildReport('xyz', calc, meta, ISO);
  assert.strictEqual(resXyz.text, resMd.text);
});

test('Failed calculation: md report shows errors and warnings', () => {
  const failedResult = { ok: false, errors: ['ошибка 1'], warnings: ['предупр 1'] };
  const res = buildReport('md', { input, result: failedResult }, null, ISO);
  
  assert.ok(res.text.includes('# Расчёт не выполнен'), 'contains failure title');
  assert.ok(res.text.includes('Ошибка: ошибка 1'), 'contains error');
  assert.ok(res.text.includes('Предупреждение: предупр 1'), 'contains warning');
  assert.ok(!res.text.includes('## Итог'), 'does not contain summary section');
});

test('HTML escaping: script tags in warnings are escaped', () => {
  const resultWithScript = { ...result, warnings: ['<script>x</script>'] };
  const res = buildReport('html', { input, result: resultWithScript }, meta, ISO);
  
  assert.ok(!res.text.includes('<script>'), 'no script tag in html');
  assert.ok(res.text.includes('&lt;script&gt;'), 'escaped script tag in html');
});

test('Table cell escaping in markdown: pipe in provenance note is escaped', () => {
  const origProvenance = result.rows[0].provenance ? [...result.rows[0].provenance] : [];
  if (origProvenance.length > 0) {
    origProvenance[0] = { ...origProvenance[0], note: 'a|b' };
  } else {
    origProvenance.push({ note: 'a|b' });
  }
  
  const resultWithPipe = { ...result, rows: [{ ...result.rows[0], provenance: origProvenance }] };
  const res = buildReport('md', { input, result: resultWithPipe }, meta, ISO);
  
  assert.ok(res.text.includes('a\\|b'), 'pipe in note is escaped');
});

test('Missing optional parts do not throw and omit headings', () => {
  // Missing limits
  const resNoLimits = buildReport('md', { input, result: { ...result, limits: undefined } }, null, ISO);
  assert.ok(typeof resNoLimits.text === 'string');
  assert.ok(!resNoLimits.text.includes('Нормы РФ'), 'no RF norms heading');
  assert.ok(!resNoLimits.text.includes('Зарубежные нормы'), 'no foreign norms heading');

  // Missing warnings
  const resNoWarnings = buildReport('md', { input, result: { ...result, warnings: undefined } }, null, ISO);
  assert.ok(typeof resNoWarnings.text === 'string');
});

test('Dose line: md text contains formatted dose', () => {
  const expectedDoseStr = fmtDose(result.totals.doseSvPerYear);
  const res = buildReport('md', calc, meta, ISO);
  assert.ok(res.text.includes(expectedDoseStr), `text should contain ${expectedDoseStr}`);
});

test('HTML: ячейки таблиц экранируются (примечание источника с тегом)', () => {
  const rows = result.rows.map((r, i) => i ? r : { ...r, provenance: [{ ...r.provenance[0], note: '<b>x</b>' }, ...r.provenance.slice(1)] });
  const html = buildReport('html', { input, result: { ...result, rows } }, null, ISO).text;
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('Тип содержимого: md — text/markdown, html — text/html, json — application/json', () => {
  assert.match(buildReport('md', calc, meta, ISO).mime, /^text\/markdown/);
  assert.match(buildReport('html', calc, meta, ISO).mime, /^text\/html/);
  assert.match(buildReport('json', calc, meta, ISO).mime, /^application\/json/);
});

test('Склонение лет в итоговой таблице (md и html): 2 года, 5 лет, 11 лет, 21 год', () => {
  for (const [n, word] of [[2, 'года'], [5, 'лет'], [11, 'лет'], [21, 'год']]) {
    const c = { input: { ...input, years: n }, result };
    for (const fmt of ['md', 'html']) {
      const text = buildReport(fmt, c, meta, ISO).text;
      assert.ok(text.includes(`Доза за ${n} ${word}`), `${fmt}: «Доза за ${n} ${word}»`);
      assert.ok(text.includes(`Риск от этого питания за ${n} ${word}`), `${fmt}: «Риск от этого питания за ${n} ${word}»`);
    }
  }
});

test('Склонение лет: при years = 1 строк «за N …» нет, «70 лет» нормы не меняется', () => {
  const one = buildReport('md', { input: { ...input, years: 1 }, result }, meta, ISO).text;
  assert.ok(!one.includes('Доза за 1 '), 'строка «Доза за N» при years = 1 не выводится');
  const many = buildReport('md', { input: { ...input, years: 2 }, result }, meta, ISO).text;
  assert.ok(many.includes('Доза и нормы облучения'), 'блок «Доза и нормы облучения» на месте');
});
