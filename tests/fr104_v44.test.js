// #FR-104 v44: (1) десятичная запятая в подсказках полей «Сравнения»; (2) НКДАР ООН 2000 в «Источниках» обоих режимов; (3) пояснение пересчёта сушёного продукта в нормах других стран
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { REGIONS } from '../src/calc/region.js';
import { buildBibliography } from '../src/ui/bibliography.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const scen = (region, over = {}) => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...over });
const tab = (input, t) => renderJsx('src/react/Result.jsx', 'default', { result: computeScenario(data, input), input, meta: META, initialTab: t });
const TABS = ['sum', 'norms', 'calc', 'cmp', 'life', 'src'];
const DOTNUM = /\d\.\d/;
const dried = (region, over = {}) => inputFor('mushrooms_dried', 'белые грибы', [['Cs-137', 2000]], { product: { name: 'белые грибы', state: 'dried' }, region, ...over });

function hintAttrs(html) {
  const out = [];
  const re = /\s(placeholder|title|aria-label)="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push([m[1], m[2]]);
  }
  const tRe = /<title>([\s\S]*?)<\/title>/g;
  while ((m = tRe.exec(html)) !== null) {
    out.push(['<title>', m[1]]);
  }
  return out;
}

test('FR-104 п.1: в подсказках полей «Сравнения» (placeholder) нет десятичной точки, а число — с запятой', async () => {
  for (const region of REGIONS) {
    const html = await tab(scen(region), 'cmp');
    const ph = hintAttrs(html).filter(([k]) => k === 'placeholder');
    assert.ok(ph.length >= 4);
    const bad = ph.filter(([, v]) => DOTNUM.test(v));
    assert.deepEqual(bad, []);
  }
  const ru = await tab(scen('ru'), 'cmp');
  assert.ok(ru.includes('placeholder="56,2"'));
});

test('FR-104 п.1: ни в одном title / aria-label / placeholder / подсказке сектора на шести вкладках нет «цифра.цифра» (оба режима)', async () => {
  const found = [];
  for (const region of REGIONS) {
    for (const t of TABS) {
      const html = await tab(scen(region), t);
      for (const [k, v] of hintAttrs(html)) {
        const plain = v.replace(/&quot;|&amp;|&#x27;|&#39;/g, ' ');
        if (DOTNUM.test(plain) && !/\b\d+\.\d+\.\d+/.test(plain) && !/\d\.\d+\.\d{4}/.test(plain)) {
          found.push(`${region}/${t}/${k}: ${plain.slice(0, 50)}`);
        }
      }
    }
  }
  assert.deepEqual(found, []);
});

test('FR-104 п.2: «НКДАР ООН 2000» в тексте «Сравнения» — и в «Источниках» режима «Россия» (и «Мир») есть запись UNSCEAR2000', async () => {
  const rec = data.compare.find(r => r.id === 'dwell_hours');
  assert.equal(rec.source, 'UNSCEAR2000', 'источник времени в помещении — из данных');
  for (const region of REGIONS) {
    const input = scen(region);
    const cmpText = norm(await tab(input, 'cmp'));
    assert.ok(/НКДАР ООН 2000/.test(cmpText), `${region}: текст ссылается на НКДАР 2000`);
    const ids = buildBibliography(computeScenario(data, input)).map(b => b.id);
    assert.ok(ids.includes('UNSCEAR2000'), `${region}: UNSCEAR2000 не в списке источников`);
    const srcText = norm(await tab(input, 'src'));
    assert.ok(/НКДАР ООН 2000/.test(srcText), `${region}: вкладка «Источники» без НКДАР ООН 2000`);
  }
});

test('FR-104 п.3: сушёный продукт — на «Соответствии нормам» есть пояснение пересчёта «по свежему продукту … ÷ коэффициент сушки (5)»', async () => {
  for (const region of REGIONS) {
    const input = dried(region, { dryingFactor: 5 });
    const res = computeScenario(data, input);
    assert.ok(res.limits.foreign.length > 0, 'зарубежные нормы есть');
    const text = norm(await tab(input, 'norms'));
    assert.ok(/по свежему продукту: измеренное значение ÷ коэффициент сушки \(5\)/.test(text), `${region}: пояснения нет`);
  }
  const t7 = norm(await tab(dried('world', { dryingFactor: 7 }), 'norms'));
  assert.ok(/коэффициент сушки \(7\)/.test(t7) && !/коэффициент сушки \(5\)/.test(t7));
});

test('FR-104 п.3: свежий продукт и сушёный без коэффициента — пояснения нет', async () => {
  const fresh = norm(await tab(inputFor('mushrooms_fresh', 'белые грибы', [['Cs-137', 2000]], { region: 'world' }), 'norms'));
  assert.ok(!/коэффициент сушки/.test(fresh));
  const noK = norm(await tab(dried('world', { dryingFactor: null }), 'norms'));
  assert.ok(!/коэффициент сушки/.test(noK));
});
