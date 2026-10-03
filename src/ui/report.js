import { esc, fmtNum, fmtSci, fmtDose, fmtPct, verdictText } from './fmt.js';
import { AGE_LABEL, SOURCE_LABEL } from './form.js';
import { locRu, unitRu } from './ru.js';
import { sourceFull, yearsWord } from './render.js';

export const FORMATS = [
  { id: 'md', label: 'Markdown (.md)', ext: 'md', mime: 'text/markdown;charset=utf-8' },
  { id: 'html', label: 'Веб-страница (.html, для печати в PDF)', ext: 'html', mime: 'text/html;charset=utf-8' },
  { id: 'json', label: 'JSON (данные для программ)', ext: 'json', mime: 'application/json' }
];

// Утилита для очистки HTML тегов и сущностей
const plain = (html) => String(html).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Построение модели блоков отчета
function blocks(calc, meta, isoDate) {
  const { input, result } = calc;

  // Если расчет не выполнен успешно
  if (!result.ok) {
    const b = [{ kind: 'h1', text: 'Расчёт не выполнен' }];
    (result.errors || []).forEach(e => b.push({ kind: 'p', text: `Ошибка: ${e}` }));
    (result.warnings || []).forEach(w => b.push({ kind: 'p', text: `Предупреждение: ${w}` }));
    return b;
  }

  const totals = result.totals;
  const b = [];

  // a. Заголовок и дата
  b.push({ kind: 'h1', text: 'Доза и риск от радионуклидов в пище' });
  b.push({ kind: 'p', text: `Дата расчёта: ${isoDate.slice(0, 10)} ${isoDate.slice(11, 16)} (UTC)` });

  // b. Итог
  b.push({ kind: 'h2', text: 'Итог' });
  const summaryRows = [
    ['Доза за год', fmtDose(totals.doseSvPerYear)],
    ['Пожизненный риск (номинальный, с учётом вреда) от 1 года потребления, на 1 млн', fmtNum(totals.riskPerYear * 1e6)],
    ['Возрастная группа и источник коэффициентов', `${AGE_LABEL[input.age] || input.age}; ${SOURCE_LABEL[input.doseSource] || input.doseSource}`]
  ];
  if (input.years > 1) {
    const span = input.years + ' ' + yearsWord(input.years);
    summaryRows.push(['Доза за ' + span, fmtDose(totals.doseSvTotal)]);
    summaryRows.push(['Пожизненный риск (номинальный) на 1 млн за ' + span + ' потребления', fmtNum(totals.riskTotal * 1e6)]);
  }
  // доли норм НРБ-99/2009 — только техногенная часть (п. 3.1.3, 5.3.1)
  summaryRows.push(['Горизонт ожидаемой дозы (МКРЗ 103, прил. B, п. (f))', input.lifetime ? 'до 70 лет возраста (питание с ' + input.lifetime.fromAge + ' до ' + input.lifetime.toAge + ' лет)' : input.age === 'adult' ? '50 лет после поступления (взрослый)' : 'до 70 лет возраста (ребёнок)']);
  summaryRows.push(['Коэффициент риска, Зв⁻¹', fmtNum(input.riskCoeffPerSv)]);
  summaryRows.push(['Доля предела 1 мЗв/год (НРБ табл. 3.1), техногенные', totals.budgetShare1mSv == null ? 'не нормируется (только природные нуклиды)' : fmtPct(totals.budgetShare1mSv)]);
  if (input.years > 1) summaryRows.push(['Доля 70 мЗв за 70 лет (НРБ п. 3.1.4), техногенные', totals.lifeShare70mSv == null ? 'не нормируется' : fmtPct(totals.lifeShare70mSv)]);
  if (totals.naturalNuclides?.length) summaryRows.push(['Природные нуклиды (предел дозы не установлен)', totals.naturalNuclides.join(', ')]);
  b.push({ kind: 'table', head: ['Показатель', 'Значение'], body: summaryRows, num: [false, false] });

  // c. Расчет по нуклидам
  b.push({ kind: 'h2', text: 'Расчёт по нуклидам' });
  const nuclideHead = ['Нуклид', 'A, Бк/кг', 'Fr', 'M, кг/год', 'e, Зв/Бк', 'Доза, мкЗв/год'];
  const nuclideNum = [false, true, true, true, true, true];
  const nuclideBody = (result.rows || []).map(r => [
    r.nuclide,
    fmtNum(r.rawBqPerKg),
    fmtNum(r.frUsed),
    fmtNum(input.portionKg * input.portionsPerYear),
    fmtSci(r.eSvPerBq),
    fmtNum(r.doseSvPerYear * 1e6)
  ]);
  b.push({ kind: 'table', head: nuclideHead, body: nuclideBody, num: nuclideNum });

  // d. Нормы РФ / ЕАЭС
  if (result.limits?.ru?.length) {
    b.push({ kind: 'h2', text: 'Нормы РФ / ЕАЭС' });
    const ruHead = ['Нуклид', 'Норматив H', 'Активность, Бк/кг', 'A/H', 'Документ'];
    const ruNum = [false, true, true, true, false];
    const ruBody = result.limits.ru.map(l => {
      let hVal = 'нет данных';
      if (l.limitId) {
        hVal = `${fmtNum(l.H)} ${unitRu(l.unit)}`;
      } else if (l.notNormed) {
        hVal = 'не нормируется';
      }
      const docStr = `${l.document || ''} (${l.loc ? locRu(l.loc) : ''})`;
      return [l.nuclide, hVal, fmtNum(l.activity), fmtNum(l.ratio), docStr];
    });
    b.push({ kind: 'table', head: ruHead, body: ruBody, num: ruNum });

    if (result.limits.compliance) {
      const { B, dB, verdict } = result.limits.compliance;
      b.push({ kind: 'p', text: `B = ${fmtNum(B)}, ΔB = ${fmtNum(dB)}, ${verdictText(verdict)}` });
    }
  }

  // e. Зарубежные нормы
  if (result.limits?.foreign?.length) {
    b.push({ kind: 'h2', text: 'Зарубежные нормы' });
    const fHead = ['Юрисдикция', 'Документ', 'Категория', 'Норматив, Бк/кг', 'A/норматив'];
    const fNum = [false, false, false, true, true];
    const fBody = result.limits.foreign.map(l => {
      let docStr = l.document;
      if (l.force?.label) {
        docStr += ` — ${l.force.label}`;
      }
      return [l.jurisdiction, docStr, l.food_category_ru, fmtNum(l.value), fmtNum(l.ratio)];
    });
    b.push({ kind: 'table', head: fHead, body: fBody, num: fNum });
  }

  // f. Источники чисел
  b.push({ kind: 'h2', text: 'Источники чисел' });
  const srcHead = ['Величина', 'Значение', 'Источник'];
  const srcNum = [false, true, false];
  const provenanceList = (result.rows || []).flatMap(r =>
    (r.provenance || []).map(p => ({ ...p, nuclide: r.nuclide }))
  );
  const srcBody = provenanceList.map(p => {
    const valStr = `${fmtNum(p.value)} ${unitRu(p.unit)}`.trim();
    const srcStr = plain(sourceFull(p.source)) +
      (p.loc ? ', ' + locRu(p.loc) : '') +
      (p.level ? ' [' + p.level + ']' : '') +
      (p.note ? ' — ' + p.note : '');
    return [`${p.nuclide} · ${p.step}${p.what ? ': ' + p.what : ''}`, valStr, srcStr];
  });
  b.push({ kind: 'table', head: srcHead, body: srcBody, num: srcNum });

  // g. Предупреждения
  if (result.warnings?.length) {
    b.push({ kind: 'h2', text: 'Предупреждения' });
    result.warnings.forEach(w => b.push({ kind: 'p', text: `— ${w}` }));
  }

  // h. Метаданные
  if (meta) {
    const shaShort = String(meta.sha || '').slice(0, 8);
    b.push({ kind: 'p', text: `Данные: ${meta.datasets} наборов, ${meta.records} записей, sha ${shaShort}` });
  }

  return b;
}

// Рендеринг в Markdown
function renderMd(blocks) {
  const lines = [];
  blocks.forEach(block => {
    if (block.kind === 'h1') lines.push(`# ${block.text}`);
    else if (block.kind === 'h2') lines.push(`## ${block.text}`);
    else if (block.kind === 'p') lines.push(`${block.text}`);
    else if (block.kind === 'table') {
      const { head, body, num } = block;
      // Экранирование | и замена переносов строк
      const escCell = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      
      lines.push(`| ${head.map(escCell).join(' | ')} |`);
      lines.push(`| ${head.map((_, i) => num[i] ? '---:' : '---').join(' | ')} |`);
      body.forEach(row => {
        lines.push(`| ${row.map(escCell).join(' | ')} |`);
      });
    }
    lines.push(''); // Пустая строка между блоками
  });
  return lines.join('\n') + '\n';
}

// Рендеринг в HTML
function renderHtml(blocks) {
  const css = `body{font:14px/1.45 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#222}table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{border:1px solid #bbb;padding:3px 6px;text-align:left}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}h1{font-size:20px}h2{font-size:16px;margin-top:20px}@media print{body{margin:0}}`;
  
  let bodyContent = '';
  blocks.forEach(block => {
    if (block.kind === 'h1') bodyContent += `<h1>${esc(block.text)}</h1>`;
    else if (block.kind === 'h2') bodyContent += `<h2>${esc(block.text)}</h2>`;
    else if (block.kind === 'p') bodyContent += `<p>${esc(block.text)}</p>`;
    else if (block.kind === 'table') {
      const { head, body, num } = block;
      let t = '<table>';
      // Заголовок
      t += '<thead><tr>';
      head.forEach((h, i) => {
        const cls = num[i] ? ' class="n"' : '';
        t += `<th${cls}>${esc(h)}</th>`;
      });
      t += '</tr></thead>';
      // Тело
      t += '<tbody>';
      body.forEach(row => {
        t += '<tr>';
        row.forEach((cell, i) => {
          const cls = num[i] ? ' class="n"' : '';
          t += `<td${cls}>${esc(cell)}</td>`;
        });
        t += '</tr>';
      });
      t += '</tbody></table>';
      bodyContent += t;
    }
  });

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Доза и риск от радионуклидов</title><style>${css}</style></head><body>${bodyContent}</body></html>`;
}

export function buildReport(format, calc, meta, isoDate) {
  // Формирование имени файла
  const datePart = isoDate.slice(0, 4) + isoDate.slice(5, 7) + isoDate.slice(8, 10);
  const timePart = isoDate.slice(11, 13) + isoDate.slice(14, 16);
  
  let ext = 'md';
  let mime = 'text/markdown;charset=utf-8';
  let text = '';

  if (format === 'json') {
    ext = 'json';
    mime = 'application/json';
    text = JSON.stringify({ generatedAt: isoDate, input: calc.input, result: calc.result, data: meta }, null, 2);
  } else {
    // Для md и html (и неизвестных форматов) используем общую модель блоков
    const reportBlocks = blocks(calc, meta, isoDate);
    
    if (format === 'html') {
      ext = 'html';
      mime = 'text/html;charset=utf-8';
      text = renderHtml(reportBlocks);
    } else {
      // По умолчанию md
      ext = 'md';
      mime = 'text/markdown;charset=utf-8';
      text = renderMd(reportBlocks);
    }
  }

  return {
    text,
    mime,
    ext,
    fileName: `radiorisk-${datePart}-${timePart}.${ext}`
  };
}
