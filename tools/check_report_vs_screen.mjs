// #FR-88 v21, слой c: печатный отчёт против экрана результата, без браузера. Запуск: node tools/check_report_vs_screen.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario, listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { buildReport } from '../src/ui/report.js';
import { summaryParts } from '../src/ui/summary_text.js';
import { fmtNum, fmtSci, fmtDose, fmtBLine, verdictText } from '../src/ui/fmt.js';
import { locRu, unitRu } from '../src/ui/ru.js';
import { JUR_RU } from '../src/ui/render.js';
import { T, fill } from '../src/ui/texts_v.js';
import { seriesLabel } from '../src/calc/diet.js';
import { loadJsx } from '../tests/render_helper.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const ch = listChoices(data);

// Нормализация текста: убираем теги, декодируем сущности, схлопываем пробелы.
function norm(s) {
  if (s == null) return '';
  let x = String(s);
  x = x.replace(/<[^>]*>/g, ' ');
  x = x.replace(/&lt;/g, '<');
  x = x.replace(/&gt;/g, '>');
  x = x.replace(/&quot;/g, '"');
  x = x.replace(/&#39;/g, "'");
  x = x.replace(/&#x27;/g, "'");
  x = x.replace(/&nbsp;/g, ' ');
  x = x.replace(/&amp;/g, '&');
  x = x.replace(/[|\\]/g, ' ');
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}

const OWN = { dietMode: 'own', portionG: '200', timesPerDay: '1', daysPerWeek: '3', weeksPerMonth: '4', monthsPerYear: '12' };
const OWN20 = { ...OWN, portionG: '20' };

export const SCENARIOS = [
  { id: 'milk-default', label: 'молоко, режим «по умолчанию»', product: 'молоко', form: 'fresh' },
  { id: 'meat-default', label: 'мясо, по умолчанию', product: 'говядина', form: 'fresh' },
  { id: 'game-own', label: 'дичь, режим «знаю»', product: 'лось', form: 'fresh', over: OWN },
  { id: 'fish-own', label: 'рыба, Cs-137 + природный Po-210', product: 'щука', form: 'fresh', over: OWN, nucs: [['Cs-137', '200', '20'], ['Po-210', '5', '1']] },
  { id: 'mushrooms-default', label: 'грибы свежие, по умолчанию', product: 'белые грибы', form: 'fresh' },
  { id: 'berries-own', label: 'ягоды', product: 'черника', form: 'fresh', over: OWN },
  { id: 'cocoa-default', label: 'масло какао (подпись)', product: 'масло какао', form: 'fresh' },
  { id: 'tap-water-own', label: 'вода из крана', product: 'вода из-под крана', form: 'fresh', over: { ...OWN, portionG: '2000' } },
  { id: 'bottled-water-own', label: 'вода бутилированная', product: 'вода бутилированная', form: 'fresh', over: { ...OWN, portionG: '2000' } },
  { id: 'well-water-own', label: 'вода из колодца', product: 'вода из колодца', form: 'fresh', over: { ...OWN, portionG: '2000' } },
  { id: 'dried-k', label: 'сушёное с K', product: 'молоко сухое', form: 'dried', over: { ...OWN20, dryingFactor: '8' } },
  { id: 'dried-no-k', label: 'сушёное без K', product: 'продукт', form: 'dried', over: OWN20, group: 'milk_products' },
  { id: 'dried-converted', label: 'сушёное, пересчёт на сырьё (K = 5)', product: 'продукт', form: 'dried', over: { ...OWN20, dryingFactor: '5', dfUser: true }, group: 'milk_products', nucs: [['Sr-90', '240', '10']] },
  { id: 'dried-mushrooms', label: 'грибы сушёные', product: 'грибы сушёные', form: 'dried', over: OWN20 },
  { id: 'child-own', label: 'ребёнок 5 лет', product: 'молоко', form: 'fresh', over: { ...OWN, age: '5y' } },
  { id: 'child-lifetime', label: 'ребёнок, питание 3–13 лет', product: 'молоко', form: 'fresh', over: { ...OWN, age: '5y', lifeMode: true, startAge: '3', endAge: '13', years: '10' } },
  { id: 'milk-10y', label: 'молоко, 10 лет', product: 'молоко', form: 'fresh', over: { years: '10' } },
  { id: 'milk-own', label: 'молоко, режим «знаю»', product: 'молоко', form: 'fresh', over: OWN },
  { id: 'input-error', label: 'ошибка ввода', product: 'молоко', form: '' },
  { id: 'compound-processing', label: 'составная обработка', product: 'молоко', form: 'fresh', over: { procMode: 'record', procRecs: ['trs75_casein_acid_coagulation_casein_production_acid_coagulati_cs', 'lysenko17_acid_casein_cs'] } },
  { id: 'processing-min', label: 'обработка, вариант «минимум»', product: 'молоко', form: 'fresh', over: { procMode: 'record', procRecs: ['trs75_casein_acid_coagulation_casein_production_acid_coagulati_cs'], procVar: 'min' } },
  { id: 'cooked', label: 'готовое блюдо', product: 'суп грибной', form: 'cooked', over: OWN },
  { id: 'natural-only', label: 'только природный нуклид', product: 'щука', form: 'fresh', over: OWN, nucs: [['Po-210', '5', '1']] },
  { id: 'poor-precision', label: 'точность измерения ΔB > 0,3', product: 'молоко', form: 'fresh', nucs: [['Cs-137', '200', '200']] },
  { id: 'milk-cs-sr', label: 'молоко, Cs-137 + Sr-90', product: 'молоко', form: 'fresh', nucs: [['Cs-137', '200', '20'], ['Sr-90', '10', '1']] },
];

export function buildScenario(scn) {
  let raw = S.initialRaw(ch);
  raw = S.setField(raw, ch, 'measuredForm', scn.form);
  raw = S.setField(raw, ch, 'product', scn.product);
  if (scn.group) raw = S.setField(raw, ch, 'foodGroup', scn.group);
  raw = { ...raw, ...(scn.over || {}) };
  raw.nuclides = (scn.nucs || [['Cs-137', '200', '20']]).map(([n, m, u]) => ({ ...S.newNuclide(n), measured: m, unc: u }));
  const input = S.toInput(raw, ch);
  return { input, result: computeScenario(data, input) };
}

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const ISO = '2026-10-10T12:00:00.000Z';
const TABS = ['', 'ru', 'uv', 'foreign', 'cmp', 'life', 'ref', 'src'];

// Собирает список ожидаемых сниппетов для одного сценария.
function collectExpectations(input, result) {
  const out = [];
  const expect = (field, snippet, where = 'both') => {
    const s = norm(snippet);
    if (!s) return;
    out.push({ field, snippet: s, where });
  };

  if (!result.ok) {
    for (const e of result.errors || []) expect('ошибка', e);
    for (const w of result.warnings || []) expect('предупреждение', w);
    return out;
  }

  const t = result.totals;
  const massKg = input.portionKg * input.portionsPerYear;

  // 1. Сводка (summaryParts)
  const p = summaryParts(result, input);
  const parts = [
    p.head, p.natural, p.number, p.caption, p.background, p.equiv, p.verbal,
    ...(p.notes || []), p.link,
    p.verdict.title, ...(p.verdict.lines || []).map(l => l.text), p.verdict.sep,
    p.dose.head, ...(p.dose.lines || []),
  ];
  for (const v of parts) {
    if (typeof v === 'string' && v) expect('итог:сводка', v);
  }

  // 2. Дозы
  expect('доза за 1-й год', fmtDose(t.doseSvPerYear));
  if (input.years > 1) expect('доза за срок', fmtDose(t.doseSvTotal));

  // 3. Строки нуклидов
  for (const r of result.rows || []) {
    expect('строка нуклида', `${r.nuclide} ${fmtNum(r.rawBqPerKg)} ${fmtNum(r.frUsed)} ${fmtNum(massKg)} ${fmtSci(r.eSvPerBq)} ${fmtNum(r.doseSvPerYear * 1e6)}`);
  }

  // 4. Нормативы РФ
  for (const l of result.limits?.ru || []) {
    let hCell;
    if (l.limitId) hCell = `${fmtNum(l.H)} ${unitRu(l.unit)}`;
    else if (l.cooked) hCell = 'для готового блюда не установлен';
    else if (l.notNormed) hCell = 'не нормируется';
    else if (l.reference) hCell = `справочно: ${fmtNum(l.reference.H)} ${unitRu(l.reference.unit)} (другой регламент, в B не входит${l.reference.note ? '; ' + l.reference.note : ''})`;
    else hCell = 'нет данных в Прил. 4';
    let snip = `${l.nuclide} ${hCell} ${fmtNum(l.activity)}`;
    if (!l.converted) snip += ` ${fmtNum(l.ratio)}`;
    expect('норматив РФ', snip);
    if (l.document) expect('документ нормы', l.document.split(/\s[«(]/)[0]);
    if (locRu(l.loc)) expect('пункт нормы', locRu(l.loc));
  }

  // 5. B и вердикт
  if (result.limits?.compliance) {
    const { B, dB, verdict } = result.limits.compliance;
    expect('B и вердикт', `${fmtBLine(B, dB)}, ${verdictText(verdict)}`);
  }

  // 6. Подпись продукта
  if (result.limits?.productCaption) {
    expect('подпись продукта', fill(T.VERDICT_CAPTION, { entry: result.limits.productName, caption: result.limits.productCaption }));
  }

  // 7. Предупреждения
  for (const w of result.warnings || []) expect('предупреждение', w);

  // 8. Зарубежные нормативы
  for (const l of result.limits?.foreign || []) {
    expect('зарубежная: нуклид и юрисдикция', `${l.nuclides.join(' + ')} ${JUR_RU[l.jurisdiction] || l.jurisdiction}`);
    expect('зарубежная: документ', l.document);
    if (l.force?.label) expect('зарубежная: вариант', l.force.label);
    expect('зарубежная: норматив', `${l.food_category_ru} ${fmtNum(l.value)} ${fmtNum(l.ratio)}`);
  }

  // 9. Уровни вмешательства
  if (result.limits?.intervention) {
    expect('уровень вмешательства: примечание', T.UV_NOTE);
    for (const l of result.limits.intervention) {
      const uvCell = l.uv == null ? T.UV_NOT_SET : fmtNum(l.uv) + ' ' + unitRu(l.unit);
      let snip = `${l.nuclide} ${uvCell} ${fmtNum(l.activity)}`;
      if (l.ratio != null) snip += ' ' + fmtNum(l.ratio);
      expect('уровень вмешательства', snip);
    }
  }

  // 10. Провенанс
  for (const r of result.rows || []) {
    for (const p of r.provenance || []) {
      expect('источник числа', `${r.nuclide} · ${p.step}${p.what ? ': ' + p.what : ''} ${`${fmtNum(p.value)} ${unitRu(p.unit)}`.trim()}`);
    }
  }

  // 11. Рацион
  if (result.diet) {
    const d = result.diet;
    expect('рацион: ряд', seriesLabel(d.series));
    if (d.year) expect('рацион: год ряда', `${d.year} г.`);
  }

  // 12. Природные нуклиды
  if (t.naturalNuclides?.length) expect('природные нуклиды', t.naturalNuclides.join(', '));

  // 13. Мета-строка
  expect('мета', `Данные: ${META.datasets} наборов, ${META.records} записей, sha ${META.sha.slice(0, 8)}`);

  return out;
}

export async function checkAll(ids) {
  const list = ids ? SCENARIOS.filter(s => ids.includes(s.id)) : SCENARIOS;
  const { render, done } = await loadJsx('src/react/Result.jsx', 'default');
  const results = [];
  try {
    for (const scn of list) {
      const { input, result } = buildScenario(scn);
      const fails = [];
      let checks = 0;

      // Экран: рендерим все вкладки
      const screenParts = [];
      for (const tab of TABS) {
        screenParts.push(norm(render({ result, input, meta: META, initialTab: tab })));
      }
      const screen = screenParts.join(' ');

      // Отчёты
      const repMd = norm(buildReport('md', { input, result }, META, ISO).text);
      const repHtml = norm(buildReport('html', { input, result }, META, ISO).text);
      const repJson = JSON.parse(buildReport('json', { input, result }, META, ISO).text);

      const expectations = collectExpectations(input, result);

      for (const e of expectations) {
        const texts = [
          { name: 'экран', text: screen },
          { name: 'md', text: repMd },
          { name: 'html', text: repHtml },
        ];
        for (const tx of texts) {
          checks++;
          if (!tx.text.includes(e.snippet)) {
            fails.push({ field: e.field, where: tx.name, expected: e.snippet });
          }
        }
      }

      // Проверки JSON
      if (!result.ok) {
        checks++;
        if (repJson.result.ok !== false) fails.push({ field: 'json: ok', where: 'json', expected: 'false' });
      } else {
        checks++;
        if (repJson.result.ok !== true) fails.push({ field: 'json: ok', where: 'json', expected: 'true' });
        checks++;
        if (repJson.result.totals.doseSvPerYear !== result.totals.doseSvPerYear) {
          fails.push({ field: 'json: доза', where: 'json', expected: String(result.totals.doseSvPerYear) });
        }
      }

      results.push({
        id: scn.id,
        label: scn.label,
        ok: fails.length === 0,
        checks,
        fails,
      });
    }
  } finally {
    await done();
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = await checkAll();
  console.log('| id | label | проверок | расхождений |');
  console.log('|---|---|---|---|');
  for (const r of res) {
    console.log(`| ${r.id} | ${r.label} | ${r.checks} | ${r.fails.length} |`);
  }
  for (const r of res) {
    for (const f of r.fails) {
      console.log(`  - [${r.id}] ${f.field} (${f.where}): expected «${f.expected}»`);
    }
  }
  const totalScen = res.length;
  const withFails = res.filter(r => !r.ok).length;
  const totalChecks = res.reduce((a, r) => a + r.checks, 0);
  const totalFails = res.reduce((a, r) => a + r.fails.length, 0);
  console.log(`сценариев: ${totalScen}, с расхождениями: ${withFails}, проверок: ${totalChecks}, расхождений: ${totalFails}`);
  if (totalFails > 0) process.exitCode = 1;
}
