// #FR-123 (оператор 2026-10-11, верхний блок «Сводки»): один заголовок, два числа в строку, пояснения не мельче основных абзацев, легенда кружков отдельной строкой, одна фраза «Для сравнения» с единицей «смерти от рака», нейтральный стиль
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { deathsPhrase, deathsGen, plural, WORDS } from '../src/ui/texts_v.js';
import { fmtCount, fmtPerMillion } from '../src/ui/fmt.js';
import { buildReport } from '../src/ui/report.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const mk = (over = {}, a = 100) => inputFor('milk', 'молоко', [['Cs-137', a, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1, ...over });
const flat = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[\s  ]+/g, ' ');
const input = mk(), result = computeScenario(data, input);
const html = await renderJsx('src/react/Summary.jsx', 'RiskSummary', { result, input });
const text = flat(html);
const css = readFileSync(root + 'src/ui/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel) => { const m = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(r => r[1].split(',').map(s => s.trim()).includes(sel)); return m.map(r => r[2]).join(';'); };

test('FR-123: заголовок блока один — «Риск от этого питания», второго заголовка с тем же смыслом нет', () => {
  assert.equal((html.match(/class="rs-head"/g) || []).length, 1);
  assert.equal((text.match(/Риск при потреблении этого продукта/g) || []).length, 1);
  assert.ok(!/Риск за всю жизнь от/.test(text) && !/Риск при потреблении этого продукта за/.test(text));
});

test('FR-123: оба числа в одном контейнере-строке .rs-nums с короткими подписями, склонение срока', () => {
  const box = html.match(/<div class="rs-nums">([\s\S]*?)<\/div><\/div><\/div>/)[1];
  assert.equal((box.match(/class="rs-number/g) || []).length, 2);
  assert.ok(text.includes('При потреблении в течение 1 года'));
  assert.ok(text.includes(`При таком же потреблении в течение ${result.eating.H} лет (с ${result.eating.fromAge} до ${result.eating.toAge} лет)`));
  assert.match(rule('.rs-nums'), /display:\s*grid/);
});

test('FR-123: пояснения (.rs-notes, пояснение под шкалой) не мельче основных абзацев блока (по правилам CSS)', () => {
  const pxOf = (s) => Number((rule(s).match(/font-size:\s*(\d+)px/) || [])[1]);
  const base = 12; // основные абзацы блока (.rs-caption) и .hint вкладок — 12 px (window.css)
  for (const sel of ['.rs-notes', '.riskbox p.risksrc']) assert.ok(pxOf(sel) >= base, `${sel}: ${pxOf(sel)} px`);
  const px = (rule('.scalelbl').match(/font-size:\s*(\d+)px/) || [])[1];
  assert.ok(Number(px) >= 12, 'подписи отметок шкалы не мельче 12 px');
});

test('FR-123: легенда кружков — отдельным абзацем после подписей отметок шкалы (не внутри и не перед ними)', () => {
  const iLbl = html.indexOf('class="scalelbl"'), iLeg = html.indexOf('class="rs-legend"');
  assert.ok(iLbl > 0 && iLeg > iLbl);
  assert.ok(!html.slice(iLbl, html.lastIndexOf('<p', iLeg)).includes('<p'), 'между подписями отметок и легендой нет абзацев');
  assert.match(html.slice(iLeg, iLeg + 200), /закрашенный кружок — потребление в течение 50 лет; полый — в течение 1 года/);
  assert.match(rule('.scalelbl'), /height:\s*1\.5rem/);
});

test('FR-123: фраза «Для сравнения» одна, с обоими числами, единица — «смерти от рака», число целым, точное в скобках', () => {
  assert.equal((text.match(/Для сравнения/g) || []).length, 1);
  const k1 = deathsPhrase(result.totals.riskNominal, fmtCount, fmtPerMillion);
  assert.ok(text.includes(`Потребление этого продукта добавило бы к ним ${k1} при потреблении в течение 1 года и `));
  const n2 = fmtCount(result.eating.riskNominal * 1e6);
  assert.ok(text.includes(`около ${n2} — при таком же потреблении в течение ${result.eating.H} лет.`));
  assert.match(k1, /смерт\S+ от рака \([\d,]+ на 1 000 000\)|меньше одной смерти от рака/);
  assert.ok(!/около \d+,\d+/.test(text.slice(text.indexOf('Для сравнения'))), 'нет «около <дробное>» без единицы');
  assert.equal(plural('1', WORDS.death), 'смерть');
  assert.equal(plural('3', WORDS.death), 'смерти');
  assert.equal(plural('94', WORDS.death), 'смерти');
  assert.equal(plural('95', WORDS.death), 'смертей');
  // после «около» — родительный падеж
  assert.deepEqual(['3', '21', '94', '12', '160 000'].map(deathsGen), ['смертей', 'смерти', 'смертей', 'смертей', 'смертей']);
  assert.equal(deathsPhrase(3.1e-6, fmtCount, fmtPerMillion), 'около 3 смертей от рака (3,1 на 1 000 000)');
  assert.equal(deathsPhrase(94e-6, fmtCount, fmtPerMillion), 'около 94 смертей от рака (94 на 1 000 000)');
  assert.match(deathsPhrase(0.0000003, fmtCount, fmtPerMillion), /^меньше одной смерти от рака \(0,3 на 1 000 000\)$/);
});

test('FR-123: на экране и в отчётах нет разговорных «есть так», «питаться так»', async () => {
  const inputs = [mk(), mk({ doseSource: 'NRB2009_App2' }), mk({ region: 'ru', age: '5y', years: 3 })];
  for (const inp of inputs) {
    const res = computeScenario(data, inp);
    const tabs = [];
    for (const tab of ['sum', 'calc']) tabs.push(flat(await renderJsx('src/react/Result.jsx', 'default', { result: res, input: inp, meta: META, initialTab: tab })));
    for (const fmt of ['md', 'html']) tabs.push(buildReport(fmt, { input: inp, result: res }, META, '2026-10-11T00:00:00Z').text);
    for (const t of tabs) assert.ok(!/есть так|питаться так|питании так/.test(t));
  }
});
