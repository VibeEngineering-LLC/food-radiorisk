import { esc, fmtNum, fmtSci, fmtDose, fmtRiskPerMillion, fmtOneIn, fmtCases, fmtPct, levelClass, gaugeClass, verdictText } from './fmt.js';
import { depositionHtml } from './product.js';
import { AGE_LABEL, SOURCE_LABEL, SOURCE_SHORT } from './form.js';
import { locRu, unitRu } from './ru.js';
import SOURCES from '../../public/data/sources.json' with { type: 'json' };
// полное описание источника из реестра (#FR-24): авторы. Название. Выходные данные, год — ссылкой на страницу документов
export function sourceFull(code) {
  if (!code) return '';
  let r = SOURCES.sources[code];
  if (r?.same_as) r = SOURCES.sources[r.same_as] || r;
  if (!r || !r.title_ru) return esc(SOURCE_SHORT[code] || code);
  const parts = [r.authors, r.title_ru, r.publisher, r.year].filter(Boolean).map(x => String(x).replace(/\.\s*$/, '')); // без «et al..»
  return `<a href="sources.html">${esc(parts.join('. '))}</a>`;
}
export const JUR_RU = { Codex: 'Кодекс Алиментариус', EU: 'ЕС', Japan: 'Япония', USA: 'США', IAEA: 'МАГАТЭ' };
import { FOOD_CLASS_RU } from '../calc/foodclass.js';

// «1 год», «2 года», «5 лет», «11 лет», «21 год»
export const yearsWord = (n) => {
  const k = Math.abs(Math.trunc(n)) % 100, d = k % 10;
  return k >= 11 && k <= 14 ? 'лет' : d === 1 ? 'год' : d >= 2 && d <= 4 ? 'года' : 'лет';
};
// #FR-20: добавочный риск — «1 на N», цвет по уровням НРБ-99/2009 п. 2.3, логарифмическая шкала 10⁻⁸…10⁻³ с отметками уровней
export const RISK_TXT = { negligible: 'пренебрежимо малый риск (не больше 1 случая на 1 млн в год, НРБ-99/2009)', within: 'выше пренебрежимого (1 на млн), но не выше 50 случаев на 1 млн в год — уровня, от которого установлены пределы доз населения', exceeds: 'выше 50 случаев на 1 млн в год — уровня, от которого установлены пределы доз населения' };
export const logPos = (x) => Math.max(0, Math.min(100, (Math.log10(x) + 8) / 5 * 100));
function riskBlock(totals, years) {
  const ra = totals.riskAssessment;
  if (!ra) return `<div class="n">${esc(fmtRiskPerMillion(totals.riskTotal))}</div><div class="t">добавочный риск за ${esc(String(years))} ${yearsWord(years)}</div>`;
  const main = years > 1 ? totals.riskTotal : totals.riskPerYear;
  const mark = (v, t) => `<i class="tick" style="left:${logPos(v)}%" title="${esc(t)}"></i>`;
  // #FR-50: пожизненный риск (ЛБМ, номинальный коэффициент МКРЗ 103) — числом дополнительных случаев рака на 1 млн человек за выбранный период
  return `<div class="t"><b>Дополнительные случаи рака за всю жизнь${years > 1 ? ` от ${esc(String(years))} ${yearsWord(years)} потребления` : ' от 1 года потребления'}</b></div>`
    + `<div class="n">${esc(fmtCases(main))} на 1 млн человек</div>`
    + `<div class="t">Вероятность заболеть раком за жизнь возрастает на ${esc((main * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 3, maximumFractionDigits: 20 }))} % (дополнительно ${esc(fmtOneIn(main).replace('1 из', '1 человек из'))}).</div>`
    // #FR-42: с уровнями НРБ п. 2.3 сравнивается риск от облучения за один год
    + `<div class="t">${years > 1 ? `От одного года потребления — ${esc(fmtCases(totals.riskPerYear))} на 1 млн (светлая точка; тёмная — ${esc(String(years))} ${yearsWord(years)}). ` : ''}Это <b>${esc(RISK_TXT[ra.level])}</b></div>`
    + `<div class="riskscale">${mark(ra.negligible.value, '10⁻⁶ пренебрежимо малый')}${mark(ra.limit.value, '5·10⁻⁵ НРБ п. 2.3')}`
    + (totals.riskPerYear > 0 ? `<b class="dot" style="left:${logPos(totals.riskPerYear)}%"></b>` : '')
    + (years > 1 && totals.riskTotal > 0 ? `<b class="dot dot2" style="left:${logPos(totals.riskTotal)}%"></b>` : '') + `</div>`
    + `<div class="scalelbl"><span style="left:0">0,01 на млн</span><span style="left:${logPos(ra.negligible.value)}%">1</span><span style="left:${logPos(ra.limit.value)}%">50</span><span style="left:100%">1000 на млн</span></div>`
    + `<p class="hint risksrc">Уровни риска: НРБ-99/2009, ${esc((ra.limit.loc || 'п. 2.3').replace(/PDF p\./g, 'с. PDF '))}; риск = доза × коэффициент номинального риска (ICRP 103, табл. 1; НРБ-99/2009, п. 2.3), линейная беспороговая модель. Пределы доз населения установлены по пожизненному риску от облучения в течение года (НРБ-99/2009, п. 2.3).</p>`;
}
// lvl: negligible | within | exceeds — подсветка по норме (#FR-29); без нормы карточка серая
const kpi = (v, l, lvl) => `<div class="kpi${lvl ? ' risk-' + esc(lvl) : ''}"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;
// годовая доза: ≤ 10 мкЗв — пренебрежимо малая (НРБ-99/2009 п. 1.4), ≤ 1 мЗв — в пределах бюджета пищевого пути (МУК 2.6.1.1194-03)
export const doseLvl = (svPerYear) => !Number.isFinite(svPerYear) ? '' : svPerYear <= 1e-5 ? 'negligible' : svPerYear <= 1e-3 ? 'within' : 'exceeds';
const th = t => `<th>${esc(t)}</th>`;
// raw=true: содержимое уже собрано из esc()-значений (например <code>, <span class="chip">) и повторно не экранируется
const td = (t, c = '', raw = false) => `<td${c ? ` class="${esc(c)}"` : ''}>${raw ? t : esc(t)}</td>`;
const numTd = (v, c = 'num') => td(typeof v === 'number' ? fmtNum(v) : esc(String(v)), c);

function tableHtml(rows, cols) {
  if (!rows.length) return '';
  const h = cols.map(c => th(c.h)).join('');
  // c.c — класс ячейки (строка или функция строки), c.raw — f() возвращает готовый HTML
  const b = rows.map(r => `<tr>${cols.map(c => td(c.f(r), (typeof c.c === 'function' ? c.c(r) : c.c) || '', !!c.raw)).join('')}</tr>`).join('');
  return `<div class="tablewrap"><table><thead><tr>${h}</tr></thead><tbody>${b}</tbody></table></div>`;
}

function scienceHtml(result, input, meta) {
  let h = '';
  result.errors.forEach(e => h += `<div class="msg err">${esc(e)}</div>`);
  result.warnings.forEach(w => h += `<div class="msg warn">${esc(w)}</div>`);
  if (!result.ok) return h;

  const { totals, rows, limits } = result;
  h += `<div class="kpis">`;
  const dl = doseLvl(totals.doseSvPerYear);
  h += kpi(fmtDose(totals.doseSvPerYear), 'Доза за год', dl);
  h += kpi(fmtDose(totals.doseSvTotal), `Доза за ${input.years} ${yearsWord(input.years)}`, dl);
  h += kpi(`${fmtCases(totals.riskPerYear)} на 1 млн`, 'Доп. случаи рака за всю жизнь от 1 года потребления (ЛБМ)', totals.riskAssessment?.level);
  if (input.years > 1) h += kpi(`${fmtCases(totals.riskTotal)} на 1 млн`, `Доп. случаи рака за всю жизнь от ${input.years} ${yearsWord(input.years)} потребления`);
  // #FR-21: доли в % непонятны при больших кратностях («6 000 %») — показываем «в N раз выше» или «N % от»
  // «в 1,33 раза», «в 3 раза», «в 22 раза», «в 60 раз», «в 12 раз» (число — как его покажет fmtNum, 3 значащие цифры)
  const razWord = (x) => { const n = Number(x.toPrecision(3)); if (!Number.isInteger(n)) return 'раза';
    const k = n % 100, d = n % 10; return (d >= 2 && d <= 4 && !(k >= 12 && k <= 14)) ? 'раза' : 'раз'; };
  const vs = (share, what) => share >= 1
    ? [`в ${fmtNum(share)} ${razWord(share)} выше`, what]
    : [`${fmtPct(share)} от`, what];
  h += kpi(...vs(totals.budgetShare1mSv, 'предела 1 мЗв/год на пищевой путь (МУК 2.6.1.1194-03)'), dl);
  h += kpi(...vs(totals.negligibleShare, 'пренебрежимо малой дозы 10 мкЗв/год (НРБ-99/2009 п. 1.4)'), dl);
  h += kpi(AGE_LABEL[input.age] || input.age, `возраст; коэффициенты дозы: ${SOURCE_LABEL[input.doseSource] || input.doseSource}`);
  h += `</div>`;
  h += `<div class="riskbox risk ${esc('risk-' + (totals.riskAssessment?.level || 'none'))}">${riskBlock(totals, input.years)}</div>`;

  h += `<h3>Расчёт по нуклидам</h3>`;
  h += tableHtml(rows, [
    { h: 'Нуклид', f: r => r.nuclide },
    { h: 'A продукта, Бк/кг', f: r => fmtNum(r.rawBqPerKg), c: 'num' },
    { h: 'Fr', f: r => fmtNum(r.frUsed), c: 'num' },
    { h: 'Поступление, Бк/год', f: r => fmtNum(r.intakeBqPerYear), c: 'num' },
    { h: 'e(g), Зв/Бк', f: r => fmtSci(r.eSvPerBq), c: 'num' },
    { h: 'Доза, мкЗв/год', f: r => fmtNum(r.doseSvPerYear * 1e6), c: 'num' },
    { h: 'Пожизненный риск за период', f: r => fmtRiskPerMillion(r.riskTotal), c: 'num' },
    { h: 'ПГП, Бк/год', f: r => fmtNum(r.pgpBqPerYear), c: 'num' },
    { h: 'Доля ПГП', f: r => fmtPct(r.pgpShare), c: 'num' }
  ]);

  h += depositionHtml(rows);

  // #FR-39: провенанс свёрнут; вместо кодов записей — что это за величина; источник — полностью (авторы, название, выходные данные, год)
  const provRows = [];
  rows.forEach(r => r.provenance.forEach(p => provRows.push({ ...p, nuclide: r.nuclide })));
  h += `<details class="prov"><summary>Откуда каждое число — ${provRows.length} ${provRows.length % 10 === 1 && provRows.length % 100 !== 11 ? 'запись' : 'записей'} с источниками</summary>`;
  h += tableHtml(provRows, [
    { h: 'Нуклид', f: p => p.nuclide },
    { h: 'Шаг', f: p => p.step },
    { h: 'Что', f: p => p.what || '' },
    { h: 'Источник', f: p => sourceFull(p.source), raw: true },
    { h: 'Место', f: p => locRu(p.loc) },
    { h: 'Уровень', f: p => p.level ? `<span class="chip ${levelClass(p.level)}">${esc(p.level)}</span>` : '', raw: true },
    { h: 'Значение', f: p => fmtNum(p.value), c: 'num' },
    { h: 'Ед.', f: p => unitRu(p.unit) },
    { h: 'Примечание', f: p => p.note || '' }
  ]);
  h += `</details>`;

  if (input.foodGroupCode && limits.ru.length) {
    h += `<h3>Нормы РФ / ЕАЭС</h3>`;
    h += tableHtml(limits.ru, [
      { h: 'Нуклид', f: l => l.nuclide },
      { h: 'Норматив H', f: l => l.limitId ? `${fmtNum(l.H)} ${unitRu(l.unit)}` : (l.notNormed ? 'не нормируется' : 'нет данных'), c: 'num' },
      { h: 'Активность, Бк/кг', f: l => fmtNum(l.activity), c: 'num' },
      { h: 'Отношение A/H', f: l => fmtNum(l.ratio), c: 'num' },
      { h: 'Документ и место', f: l => l.document ? `${l.document} (${locRu(l.loc)})` : '' }
    ]);
    if (limits.compliance) {
      const { B, dB, verdict, precisionOk } = limits.compliance;
      let txt = `B = ${fmtNum(B)}, ΔB = ${fmtNum(dB)}, <span class="verdict ${esc(verdict)}">${esc(verdictText(verdict))}</span>`;
      if (!precisionOk) txt += ' Точность измерения не удовлетворяет ΔB ≤ 0,3 (МУК 2.6.1.1194-03 п. 6.5)';
      h += `<p>${txt}</p>`;
    }
  }

  if (limits.foreign.length) {
    const cls = (limits.foreignClasses || []).map(c => FOOD_CLASS_RU[c] || c).join(', ');
    h += `<h3>Зарубежные нормы (цезий/стронций)${cls ? ` — категория: ${esc(cls)}` : ''}</h3>`;
    if (!input.foodGroupCode) h += `<p class="hint">Группа продукта не выбрана — показаны нормы для прочих пищевых продуктов.</p>`;
    h += tableHtml(limits.foreign, [
      { h: 'Юрисдикция', f: l => JUR_RU[l.jurisdiction] || l.jurisdiction },
      { h: 'Сила документа', f: l => l.force?.label || '', c: l => l.force?.rank === 3 ? 'muted' : '' },
      { h: 'Документ', f: l => l.document },
      { h: 'Категория', f: l => l.food_category_ru },
      { h: 'Норматив, Бк/кг', f: l => fmtNum(l.value), c: 'num' },
      { h: 'A/норматив', f: l => fmtNum(l.ratio), c: l => `num${l.ratio > 1 ? ' lvl-w' : ''}` },
      // #FR-51: длинные условия не растягивают строку — первая фраза видна, остальное и место в документе раскрываются
      { h: 'Условия', raw: true, c: 'cond', f: l => {
        const s = String(l.sum_rule || ''), cut = s.search(/\.\s/), sp = s.lastIndexOf(' ', 70);
        const head = s.length <= 90 ? s : cut > 0 && cut < 90 ? s.slice(0, cut + 1) : s.slice(0, sp > 0 ? sp : 70);
        const rest = s.slice(head.length).trim();
        return `${esc(head)}${rest && !/\.$/.test(head) ? '…' : ''}${rest || l.loc ? `<details><summary>подробнее</summary>${rest ? `<p>${esc(rest)}</p>` : ''}${l.loc ? `<p>Место: ${esc(locRu(l.loc))}</p>` : ''}</details>` : ''}`;
      } }
    ]);
  }

  if (meta) h += `<p class="hint">Данные: ${esc(String(meta.datasets))} наборов, ${esc(String(meta.records))} записей, sha ${esc(meta.sha.slice(0, 8))}</p>`;
  return h;
}

function posterHtml(result, input) {
  const { totals, rows, limits } = result;
  const nuclideParts = input.nuclides.map(n => n.nuclide);
  rows.filter(r => r.mode === 'measured').forEach(r => {
    const idx = nuclideParts.indexOf(r.nuclide);
    if (idx !== -1) nuclideParts[idx] = `${r.nuclide}, ${fmtNum(r.rawBqPerKg)} Бк/кг`;
  });

  let h = `<div class="poster-card">`;
  h += `<h2>${esc(nuclideParts.join(' · '))}</h2>`;
  h += `<div class="poster-unit">эффективная доза за год при заданном рационе</div>`;
  h += `<div class="poster-big">${esc(fmtDose(totals.doseSvPerYear))}</div>`;

  const maxPgpShare = Math.max(...rows.map(r => r.pgpShare), 0);
  let maxRatio = 0;
  if (limits.ru.length) maxRatio = Math.max(...limits.ru.map(l => l.ratio || 0));

  h += `<div class="poster-grid">`;
  // Cell A: Risk
  h += `<div class="poster-cell risk ${esc('risk-' + (totals.riskAssessment?.level || 'none'))}">${riskBlock(totals, input.years)}</div>`;
  // Cell B: PGP Share
  h += `<div class="poster-cell"><div class="n">${esc(fmtPct(maxPgpShare))}</div><div class="t">от предела годового поступления (ПГП, НРБ-99/2009)</div>`;
  h += `<div class="gauge ${gaugeClass(maxPgpShare)}"><i style="width:${Math.min(100, maxPgpShare * 100)}%"></i></div></div>`;
  // Cell C: Limits
  if (limits.ru.some(l => l.limitId)) {
    const verdictWord = limits.compliance ? esc(verdictText(limits.compliance.verdict)) : '';
    h += `<div class="poster-cell"><div class="n">${esc(fmtNum(maxRatio))}×</div><div class="t">от норматива ТР ТС 021/2011${verdictWord ? ' ' + verdictWord : ''}</div>`;
    h += `<div class="gauge ${gaugeClass(maxRatio)}"><i style="width:${Math.min(100, maxRatio * 100)}%"></i></div></div>`;
  } else {
    h += `<div class="poster-cell"><div class="n">—</div><div class="t">норматив не выбран</div></div>`;
  }
  // Cell D: Budget Share
  h += `<div class="poster-cell"><div class="n">${esc(fmtPct(totals.budgetShare1mSv))}</div><div class="t">от годового бюджета 1 мЗв на пищевой путь (МУК 1194-03)</div></div>`;
  // Cell E: оценка плотности загрязнения места сбора (#FR-7), по первому нуклиду с оценкой
  const dep = rows.find(r => r.depositionEstimate && Number.isFinite(r.depositionEstimate.kBqPerM2.central ?? r.depositionEstimate.kBqPerM2.min));
  if (dep) {
    const d = dep.depositionEstimate.kBqPerM2, v = d.central ?? d.min;
    // сводная оценка (#FR-31) — интервал min–max, центра нет
    const txt = d.central == null && Number.isFinite(d.max) ? `${fmtNum(d.min)}–${fmtNum(d.max)}` : `≈ ${fmtNum(v)}`;
    const ci = d.central == null && Number.isFinite(d.max) ? `${fmtNum(d.min / 37)}–${fmtNum(d.max / 37)}` : fmtNum(v / 37);
    h += `<div class="poster-cell"><div class="n">${esc(txt)}</div><div class="t">кБк/м² ${esc(dep.nuclide)} — оценка загрязнения места сбора (${esc(ci)} Ки/км²)</div></div>`;
  }
  h += `</div>`;

  // Footer
  const sourceText = input.doseSource === 'NRB2009_App2' ? 'НРБ-99/2009 Прил. 2' : 'ICRP 119 (Publ. 72)';
  let foot = `Расчёт: ${esc(sourceText)} · риск ICRP 103`;
  if (result.warnings.length) foot += ` · предупреждений: ${esc(String(result.warnings.length))}`;
  const provCount = rows.reduce((acc, r) => acc + r.provenance.filter(p => p.id).length, 0);
  foot += ` · источников чисел: ${esc(String(provCount))}`;
  h += `<p class="poster-foot">${foot}</p>`; // части foot уже экранированы
  h += `</div>`;
  return h;
}

export function renderResult(result, input, meta) {
  const sci = scienceHtml(result, input, meta);
  if (!result.ok) {
    return `<div class="science">${sci}</div><div class="poster"><div class="poster-card"><h2>Расчёт не выполнен</h2><p>Исправьте входные данные — см. сообщения в научном виде.</p></div></div>`;
  }
  // #FR-53: плакатный вид отключён — posterHtml оставлен в коде, но не выводится
  return `<div class="science">${sci}</div>`;
}
