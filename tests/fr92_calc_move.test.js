import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { fmtNum } from '../src/ui/fmt.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
// сценарий: ребёнок с питанием 3–13 лет, Cs-137 + Sr-90 (есть иттрий-90 и разбивка по возрастным группам), для Cs-137 — оценка плотности загрязнения по записям КП
const ids = data.transfer.filter(r => r.nuclide === 'Cs-137' && r.unit_norm === 'm2/kg' && r.level === '✅').slice(0, 6).map(r => r.id);
const build = () => { const input = inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } }); input.nuclides[1] = { ...input.nuclides[1], transferId: 'perevolotsky2006_kp_sr_90_bilberry' }; return input; };
const tab = async (input, initialTab) => { const result = computeScenario(data, input); return { result, text: norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab })) }; };
const BLOCKS = ['Расчёт по радионуклидам', 'Поступление, риск и предел годового поступления (ПГП) по радионуклидам', 'Иттрий-90 в продукте при Sr-90', 'Доза по возрастным группам', 'Оценка плотности загрязнения места сбора', 'Справочные величины для специалиста'];

test('FR-92: сценарий даёт все блоки', async () => {
  const { result } = await tab(build(), 'calc');
  assert.ok(result.ok);
  assert.ok(result.rows.some(r => r.depositionEstimate && typeof r.depositionEstimate === 'object'));
  assert.ok(result.rows.some(r => r.y90));
  assert.ok(result.rows.some(r => r.lifetimeBands));
});

test('FR-92: каждый перенесённый расчётный блок есть в «Подробном расчёте» и отсутствует в «Источниках»', async () => {
  // #FR-112/#FR-113: плотность загрязнения и справочные величины переехали на вкладки «Место сбора и величины» и «Для специалиста» (за «Подробным расчётом»)
  const calc = (await tab(build(), 'calc')).text + ' ' + (await tab(build(), 'site')).text + ' ' + (await tab(build(), 'spec')).text;
  const src = (await tab(build(), 'src')).text;
  for (const block of BLOCKS) {
    assert.ok(calc.includes(block), 'в «Подробном расчёте» или его вкладках-продолжениях: ' + block);
    assert.ok(!src.includes(block), 'нет в «Источниках»: ' + block);
  }
});

test('FR-92: «Источники» — только источники и методика', async () => {
  const { text: src } = await tab(build(), 'src');
  const { text: calc } = await tab(build(), 'calc');
  const { text: site } = await tab(build(), 'site');
  assert.ok(src.includes('Известные ограничения')); // #FR-121: страница «Справка» убрана, на вкладке — список литературы и ограничения
  assert.ok(!src.includes('Величина Значение Источник'), '#FR-96: таблица значений ушла с «Источников»');
  assert.ok(site.includes('Величина Значение Источник'), '#FR-113: таблица значений — на вкладке «Место сбора и величины»');
  assert.ok(!src.includes('Орган с наибольшей дозой'));
  assert.ok(!src.includes('ПГП, Бк/год'));
  assert.ok(!calc.includes('Описание каждого документа и методика расчёта'));
  
  const rawHtml = await renderJsx('src/react/Result.jsx', 'default', { result: (await tab(build(), 'src')).result, input: build(), meta: META, initialTab: 'src' });
  assert.ok(rawHtml.includes('>Источники</button>'));
  assert.ok(!rawHtml.includes('>Расчёт и источники<'));
});

test('FR-92: порядок в «Подробном расчёте»: вход → поступление → доза по годам → риск и ПГП → органы → плотность → справочные', async () => {
  // #FR-112/#FR-113: порядок сохранён по цепочке вкладок «Подробный расчёт» → «Место сбора и величины» → «Для специалиста»
  const calc = (await tab(build(), 'calc')).text + ' ' + (await tab(build(), 'site')).text + ' ' + (await tab(build(), 'spec')).text;
  const markers = [
    'I₀ = A · Fr · M',
    'E_k, Зв',
    'Расчёт по радионуклидам',
    'Поступление, риск и предел годового поступления (ПГП) по радионуклидам',
    'Оценка плотности загрязнения места сбора',
    'Значения величин и их источники', // #FR-96: таблица значений — сразу под блоком плотности
    'Справочные величины для специалиста'
  ];
  let prevIdx = -1;
  for (const m of markers) {
    const idx = calc.indexOf(m);
    assert.ok(idx > prevIdx, `Порядок нарушен для: ${m}`);
    prevIdx = idx;
  }
});

test('FR-92: числа не потеряны', async () => {
  const { result, text: calc } = await tab(build(), 'calc');
  for (const row of result.rows) {
    assert.ok(calc.includes(row.nuclide));
    assert.ok(calc.includes(fmtNum(row.doseSvPerYear * 1e6)));
    assert.ok(calc.includes(fmtNum(row.rawBqPerKg)));
  }
});
