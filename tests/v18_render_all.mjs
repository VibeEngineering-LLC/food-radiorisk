// #FR-81 V18: приёмка согласованности — рендер всех вкладок пяти сценариев S1–S5, таблица чисел «на 1 000 000», запрещённые слова, согласованность оценки по дозе (D-022); запуск: node tests/v18_render_all.mjs [файл-вывода]; используется тестом tests/fr81_v18_consistency.test.js
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { fmtPerMillion } from '../src/ui/fmt.js';

export const SCENARIOS = {
  S1: () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } }),
  S2: () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } }),
  S3: () => inputFor('berries_wild', 'черника', [['Cs-137', 400, 40]], { portionKg: 0.2, portionsPerYear: 15, years: 1 }),
  S4: () => inputFor('baby_food', 'молочная смесь', [['Cs-137', 30, 3], ['Sr-90', 5, 0.5]], { age: '3m', portionKg: 0.7, portionsPerYear: 365, years: 1 }),
  S5: () => inputFor('mushrooms_fresh', 'грибы свежие', [['Cs-137', 400, 40]], { portionKg: 0.3, portionsPerYear: 60, years: 1 }),
};

export const TABS = ['sum', 'cmp', 'life', 'norms', 'calc', 'site', 'spec', 'src']; // #FR-112/#FR-113/#FR-118: 8 вкладок в порядке экрана; // #FR-89: «Сводка», «Соответствие нормам», «Подробный расчёт», затем прежние

export const FORBIDDEN = [
  /ваш риск/i,
  /1 из /,
  /риск(?! \(на 1 млн\))[^.\n]{0,60}в год/i, // #FR-100: заголовок колонки легенды «Доза; риск (на 1 млн)» не содержит формулировки риска «в год»; следующая строка легенды «Авиаперелёты (2 × 3 ч в год)» — частота перелётов
  /пренебрежимо малый риск/i,
  /(?<![\d,])20 мкЗв/, // не часть числа вроде «120 мкЗв» (#FR-101: рентгенография грудной клетки РФ — 120 мкЗв)
  /Ē₅/,
  /ущерб/i,
  /заболеть раком/i,
  /независим/i,
];

export async function renderAll() {
  const out = {};
  for (const name of Object.keys(SCENARIOS)) {
    const input = SCENARIOS[name]();
    const result = computeScenario(data, input);
    const texts = {};
    for (const tab of TABS) {
      const html = await renderJsx('src/react/Result.jsx', 'default', {
        result,
        input,
        meta: { datasets: 0, records: 0, sha: '00000000' },
        initialTab: tab,
      });
      texts[tab] = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
    }
    out[name] = {
      input,
      result,
      R: fmtPerMillion(result.totals.riskNominal),
      texts,
    };
  }
  return out;
}

export function split(text) {
  // #FR-89: полосы вкладок идут сверху, тело выбранной вкладки — после последней подписи «Расчёт и источники»; прежнего «главного экрана» над вкладками нет
  const body = text.slice(text.indexOf('Источники') + 'Источники'.length);
  return { main: body, body };
}

// #FR-124: подписи и пояснение шкалы риска («0,01 на 1 000 000», «до 1 на 1 000 000» и т. д.) — уровни шкалы, а не R сценария
const noScale = (s) => s
  .replace(/0,01 на 1 000 000 1 50 1 000 на 1 000 000/, '')
  .replace(/Шкала логарифмическая, разделена на зоны:[^(]*\(уровни/, '(уровни');

export function analyse(rendered) {
  const table = [];
  const forbidden = [];
  const doseMismatch = [];
  const missing = [];

  const areas = (entry) => {
    const list = [];
    // #FR-117: второе число блока («Если есть так всю жизнь …») — не R за введённый срок; проверяется в tests/fr117_lifetime_eating.test.js, здесь его нет
    list.push({ name: 'main', text: noScale(split(entry.texts['sum']).main).replace(/При таком же потреблении в течение \d+ \S+ \(с \d+ до \d+ лет\)\s*\d[\d ]*(?:,\d+)? на 1 000 000/, '').replace(/Потребление этого продукта добавило бы к ним [^()]*\(\d[\d ]*(?:,\d+)? на 1 000 000\)/, '') }); // число во фразе «Для сравнения» проверяется строкой main:фон ниже
    for (const tab of ['norms', 'cmp', 'life']) {
      list.push({ name: tab, text: split(entry.texts[tab]).body });
    }
    return list;
  };

  for (const name of Object.keys(rendered)) {
    const entry = rendered[name];
    const R = entry.R;
    const Rn = R.replace(/ /g, '');
    const list = areas(entry);

    for (const area of list) {
      const re = /(\d[\d ]*(?:,\d+)?) на 1 000 000/g;
      let m;
      while ((m = re.exec(area.text)) !== null) {
        const number = m[1];
        table.push({
          scenario: name,
          where: area.name,
          number,
          expected: R,
          ok: number.replace(/ /g, '') === Rn,
        });
      }
    }

    const mainText = noScale(split(entry.texts['sum']).main);
    const mainAndNorms = mainText + ' ' + split(entry.texts['norms']).body; // блок C («Доза за самый нагруженный год») теперь на вкладке «Соответствие нормам»
    const fm = mainText.match(/добавило бы к ним (?:около \d[\d ]* смерт\S+|меньше одной смерти) от рака \((\d[\d ]*(?:,\d+)?) на 1 000 000\)/); // #FR-123: после первого числа — запятая и второе число (питание всю жизнь)
    if (fm) {
      const number = fm[1];
      table.push({
        scenario: name,
        where: 'main:фон',
        number,
        expected: R,
        ok: number.replace(/ /g, '') === Rn,
      });
    }

    const lifeText = split(entry.texts['life']).body;
    const lm = lifeText.match(/— радиационно-индуцированный рак\s+(\d[\d ]*(?:,\d+)?)(?=\s+[А-ЯЁ])/); // #FR-93: строки по возрастанию, после строки питания может идти любая причина
    if (lm) {
      const number = lm[1];
      table.push({
        scenario: name,
        where: 'life:строка продукта',
        number,
        expected: R,
        ok: number.replace(/ /g, '') === Rn,
      });
    }

    if (entry.result.ok && entry.result.totals.riskNominal !== null) {
      const mainCount = (mainText.match(/(\d[\d ]*(?:,\d+)?) на 1 000 000/g) || []).length;
      const mainExpected = entry.result.eating && entry.result.eating.ok ? 3 : 2; // #FR-117/#FR-123: число за введённый срок, второе число (всю жизнь) и «(N на 1 000 000)» во фразе «Для сравнения»
      if (mainCount !== mainExpected) {
        missing.push(`${name}: число «на 1 000 000» на главном экране найдено ${mainCount} раз`);
      }
      if (entry.texts['life'].includes('Бытовые риски за') && !lm) {
        missing.push(`${name}: строка продукта во вкладке life не найдена`);
      }
      if (!fm) {
        missing.push(`${name}: фон main:фон не найден`);
      }
    }

    for (const area of list) {
      // запрещённые слова — на главном экране и во вкладках 3–4 (спецификация 2.2); в таблицах норм (вкладки 1–2) слова приходят из текста документов
      if (!['main', 'cmp', 'life'].includes(area.name)) continue;
      for (const re of FORBIDDEN) {
        const re2 = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); // без g exec не продвигается — цикл бесконечен
        let m;
        while ((m = re2.exec(area.text)) !== null) {
          const idx = m.index;
          const start = Math.max(0, idx - 20);
          const end = Math.min(area.text.length, idx + m[0].length + 20);
          forbidden.push({
            scenario: name,
            where: area.name,
            re: String(re),
            context: area.text.slice(start, end),
          });
        }
      }
    }

    if (entry.result.totals.doseMaxYearTech !== null) {
      const verbal = mainAndNorms.match(/Оценка по наибольшей годовой дозе \((\d[\d ,]*\s?(?:мкЗв|мЗв|Зв))/);
      const dose = mainAndNorms.match(/Наибольшая годовая доза: (\d[\d ,]*\s?(?:мкЗв|мЗв|Зв))/);
      if (!verbal || !dose || verbal[1].replace(/ /g, '') !== dose[1].replace(/ /g, '')) {
        doseMismatch.push({
          scenario: name,
          verbal: verbal ? verbal[1] : null,
          dose: dose ? dose[1] : null,
        });
      }
    }
  }

  return { table, forbidden, doseMismatch, missing };
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const rendered = await renderAll();
  const rep = analyse(rendered);
  const lines = [];
  for (const name of Object.keys(rendered)) {
    const entry = rendered[name];
    lines.push(`=== ${name} (R = ${entry.R})`);
    for (const tab of TABS) {
      lines.push(`--- вкладка: ${tab === '' ? 'главная' : tab}`);
      lines.push(entry.texts[tab]);
    }
  }
  lines.push('=== ТАБЛИЦА ЧИСЕЛ');
  for (const r of rep.table) {
    lines.push(`${r.scenario} | ${r.where} | ${r.number} | ${r.expected} | ${r.ok}`);
  }
  lines.push('=== ЗАПРЕЩЁННЫЕ СЛОВА');
  lines.push(String(rep.forbidden.length));
  for (const f of rep.forbidden) {
    lines.push(`${f.scenario} | ${f.where} | ${f.re} | ${f.context}`);
  }
  lines.push('=== ДОЗА');
  lines.push(String(rep.doseMismatch.length));
  for (const d of rep.doseMismatch) {
    lines.push(`${d.scenario} | ${d.verbal} | ${d.dose}`);
  }
  lines.push('=== НЕ НАЙДЕНО');
  for (const m of rep.missing) {
    lines.push(m);
  }
  const out = process.argv[2] ?? 'v18_render_all.txt';
  writeFileSync(out, lines.join('\n'), 'utf8');
  const A = rep.table.filter(r => !r.ok).length;
  const B = rep.forbidden.length;
  const C = rep.doseMismatch.length;
  const D = rep.missing.length;
  console.log(`чисел: ${rep.table.length}, расхождений: ${A}, запрещённых слов: ${B}, расхождений по дозе: ${C}, не найдено: ${D}`);
  process.exitCode = (A + B + C + D > 0) ? 1 : 0;
}
