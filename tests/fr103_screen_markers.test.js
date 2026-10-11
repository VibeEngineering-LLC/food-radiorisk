// #FR-103 v43: охранный тест — на экране и в отчётах нет внутренних маркеров (audit/, #FR, D-0N, fr1NN, gaps-, оператор, исследования fr) ни в тексте, ни в атрибутах title/aria-label/data-*
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { loadJsx } from './render_helper.js';
import { REGIONS } from '../src/calc/region.js';
import { buildReport } from '../src/ui/report.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const TABS = ['sum', 'cmp', 'life', 'norms', 'calc', 'site', 'spec', 'src']; // #FR-112/#FR-113/#FR-118: 8 вкладок в порядке экрана
const MARK = /audit\/|#FR|D-0\d|fr1\d\d|gaps-|оператор|исследования fr/i;

const SC = [
  { id: 'milk', group: 'milk', name: 'молоко', nuc: [['Cs-137', 100, 10]], over: {} },
  { id: 'meat', group: 'meat', name: 'говядина', nuc: [['Cs-137', 100, 10]], over: {} },
  { id: 'fish', group: 'fish', name: 'щука', nuc: [['Cs-137', 200, 20], ['Po-210', 5, 1]], over: {} },
  { id: 'mushrooms', group: 'mushrooms', name: 'белые грибы', nuc: [['Cs-137', 500, 50]], over: {} },
  { id: 'child', group: 'milk', name: 'молоко', nuc: [['Cs-137', 100, 10], ['Sr-90', 10, 1]], over: { age: '5y' } },
  { id: 'water', group: 'water', name: 'вода из-под крана', nuc: [['Cs-137', 5, 1]], over: { portionKg: 2 } },
];

function findMarkers(html) {
  const out = [];
  const text = html.replace(/<[^>]+>/g, ' ');
  const gMark = new RegExp(MARK.source, 'gi');
  let m;
  while ((m = gMark.exec(text)) !== null) {
    const s = Math.max(0, m.index - 30);
    out.push(`text: ${text.slice(s, m.index + 30)}`);
  }
  const attrRe = /\s(title|aria-label|data-[\w-]+)="([^"]*)"/g;
  while ((m = attrRe.exec(html)) !== null) {
    const val = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (MARK.test(val)) out.push(`attr ${m[1]}: ${val.slice(0, 60)}`);
  }
  return out;
}

test('FR-103 v43: на всех вкладках результата в обоих режимах нет внутренних маркеров', async () => {
  const { render, done } = await loadJsx('src/react/Result.jsx', 'default');
  try {
    const map = new Map();
    for (const region of REGIONS) {
      for (const sc of SC) {
        const input = inputFor(sc.group, sc.name, sc.nuc, { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...sc.over });
        const result = computeScenario(data, input);
        for (const t of TABS) {
          const html = render({ result, input, meta: META, initialTab: t });
          for (const mk of findMarkers(html)) {
            if (!map.has(mk)) map.set(mk, `${region}/${sc.id}/${t}`);
          }
        }
      }
    }
    assert.equal(map.size, 0, `Найдены маркеры: ${[...map.entries()].map(([k, v]) => `${v}: ${k}`).join('; ')}`);
  } finally {
    done();
  }
});

test('FR-103 v43: в отчётах md и html нет внутренних маркеров', async () => {
  const map = new Map();
  for (const region of REGIONS) {
    for (const sc of SC) {
      const input = inputFor(sc.group, sc.name, sc.nuc, { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...sc.over });
      const result = computeScenario(data, input);
      for (const format of ['md', 'html']) {
        const out = buildReport(format, { input, result }, META, '2026-10-10T12:00:00.000Z');
        for (const mk of findMarkers(out.text)) {
          if (!map.has(mk)) map.set(mk, `${region}/${sc.id}/${format}`);
        }
      }
    }
  }
  assert.equal(map.size, 0, `Найдены маркеры: ${[...map.entries()].map(([k, v]) => `${v}: ${k}`).join('; ')}`);
});

test('FR-103 v43: тест умеет краснеть', () => {
  assert.equal(findMarkers('<p title="audit/x.md">текст исследования fr100</p>').length, 2);
  assert.equal(findMarkers('<p title="пресс-релиз">чисто</p>').length, 0);
});
