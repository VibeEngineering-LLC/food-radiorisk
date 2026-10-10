import { useState } from 'react';
import { esc, fmtNum, fmtNear, fmtBLine, fmtSci, fmtDose, fmtRiskPerMillion, fmtPct, levelClass, verdictText } from '../ui/fmt.js';
import { depositionHtml } from '../ui/product.js';
import { AGE_LABEL, SOURCE_LABEL } from '../ui/form.js';
import { locRu, unitRu } from '../ui/ru.js';
import { FOOD_CLASS_RU } from '../calc/foodclass.js';
import { sourceFull, JUR_RU, yearsWord } from '../ui/render.js';
import { T, fill } from '../ui/texts_v.js';
import { RiskSummary, VerdictBox, DoseBlock } from './Summary.jsx';
import Compare from './Compare.jsx';
import LifeRisks from './LifeRisks.jsx';
import Reference from './Reference.jsx';

export function Kpi({ value, unit, label, level }) {
  return <div className={'kpi' + (level ? ' risk-' + level : '')}><div className="v">{value}{unit && <span className="u"> {unit}</span>}</div><div className="l">{label}</div></div>;
}

// доля нормы: ≤ 1 % — пренебрежимо (как 10 мкЗв от 1 мЗв, НРБ п. 1.4), ≤ 100 % — в пределах, иначе превышение
const shareLvl = (s) => !Number.isFinite(s) ? '' : s <= 0.01 ? 'negligible' : s <= 1 ? 'within' : 'exceeds';

// карточка нормы: доля техногенной дозы от предела; если нуклиды только природные — «не нормируется»
function normKpi(share, limitLabel, totals) {
  const nat = totals.naturalNuclides.join(', ');
  if (share == null) return <Kpi value="не нормируется" label={`природные нуклиды (${nat}): предел дозы не установлен (НРБ-99/2009 п. 3.1.3, 5.3.1)`} />;
  const only = nat ? `; учтены только техногенные (${totals.techNuclides.join(', ')}), природные (${nat}) не нормируются` : '';
  return <Kpi value={fmtPct(share)} label={`${limitLabel}${only}`} level={shareLvl(share)} />;
}

// Карточки итогов: строки — 1 год и весь период, столбцы — доза, риск, доля нормы НРБ
export function KpiGrid({ totals, input }) {
  // e(g) — ожидаемая доза: взрослому за 50 лет после поступления, ребёнку до 70 лет возраста (МКРЗ 103)
  const horizon = input.age === 'adult' ? '50 лет' : 'до 70 лет возраста';
  const who = `Вся доза, которую даст поступление за 1 год, накопленная за ${horizon} (${(AGE_LABEL[input.age] || input.age).toLowerCase()}); ${SOURCE_LABEL[input.doseSource] || input.doseSource}`;
  const n = input.years, span = input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${n} ${yearsWord(n)}`;
  return <div className="kgrid" style={{ gridTemplateColumns: 'max-content repeat(2, minmax(0, 1fr))' }}>
    <div /><div className="kh">Ожидаемая эффективная доза</div><div className="kh">Доля нормы НРБ-99/2009</div>
    {/* #FR-81 V13: справочная сетка вкладки «Подробно»: доза и доля нормы; риск — только главное число и строки вкладки */}
    <div className="kr">1-й год питания</div>
    <Kpi value={fmtDose(totals.doseSvPerYear)} label={who} />
    {normKpi(totals.maxYearShare5mSv, 'наибольшая годовая доза — от предела 5 мЗв в один год (табл. 3.1)', totals)}
    <div className="kr">Ē₅ — наибольшая средняя за 5 лет подряд</div>
    <Kpi value={fmtDose(totals.doseSvAvg5)} label="в год, в среднем за любые 5 лет подряд (за пределами срока доза от продукта 0)" />
    {normKpi(totals.budgetShare1mSvAvg5, 'Ē₅ от предела 1 мЗв/год (табл. 3.1, п. 5.2.4)', totals)}
    {n > 1 && <>
      <div className="kr">{span}</div>
      <Kpi value={fmtDose(totals.doseSvTotal)} label={input.lifetime ? 'вся доза от питания в этот период, накопленная до 70 лет возраста' : `вся доза от поступления за ${n} ${yearsWord(n)} (сумма по годам), накопленная за ${horizon} после каждого поступления`} />
      {normKpi(totals.lifeShare70mSv, 'от 70 мЗв за период жизни 70 лет (п. 3.1.4)', totals)}
    </>}
  </div>;
}

export function DataTable({ rows, cols }) {
  if (!rows.length) return null;
  // заголовок числовой колонки выравнивается так же, как числа под ним (класс num у ячеек первой строки)
  const numCol = (c) => /\bnum\b/.test((typeof c.c === 'function' ? c.c(rows[0]) : c.c) || '');
  return <div className="tablewrap"><table><thead><tr>{cols.map((c, i) => <th key={i}>{numCol(c) ? <span style={{ display: 'block', textAlign: 'right' }}>{c.h}</span> : c.h}</th>)}</tr></thead><tbody>
    {rows.map((r, ri) => <tr key={ri}>
      {cols.map((c, ci) => {
        const cls = (typeof c.c === 'function' ? c.c(r) : c.c) || '';
        return c.html
          ? <td key={ci} className={cls || undefined} dangerouslySetInnerHTML={{ __html: c.f(r) }} />
          : <td key={ci} className={cls || undefined}>{c.f(r)}</td>;
      })}
    </tr>)}
  </tbody></table></div>;
}

export default function Result({ result, input, meta, initialTab = '' }) {
  // #FR-66: нормы РФ, зарубежные нормы и источники — одна вкладочная группа
  const [rt, setRt] = useState(initialTab); // initialTab — для тестов: открыть нужную вкладку при серверном рендере
  const [radonC, setRadonC] = useState(100); // #FR-73: ОА радона-222 дома, Бк/м³ — состояние здесь, чтобы не сбрасывалось при смене вкладки
  const [dwellU, setDwellU] = useState(NaN); // #FR-74: мощность дозы в жилище, мкЗв/ч (пусто — строки нет)
  const messages = [];
  result.errors.forEach(e => messages.push(<div key={e} className="msg err">{e}</div>));
  result.warnings.forEach(w => messages.push(<div key={w} className="msg warn">{w}</div>));
  if (!input.foodGroupCode && result.limits?.ruNone) messages.push(<div key="nogroup" className="msg warn">{result.limits.intervention ? T.VERDICT_UV : fill(T.VERDICT_NO_RU_NORM, { entry: result.limits.productName })}</div>); // v14 п. 7: у воды из колодца — уровни вмешательства НРБ-99/2009, а не «норматива нет» // #FR-85 v11: норматива РФ у продукта нет — так и сказано в результате
  else if (!input.foodGroupCode) messages.push(<div key="nogroup" className="msg warn">Группа продукта по ТР ТС 021/2011 не определена по названию — выберите её на вкладке «3 · Потребитель и нормы». Без группы нормы РФ / ЕАЭС не показываются, а зарубежные берутся для прочих пищевых продуктов.</div>);

  if (!result.ok) {
    return <>
      <div className="science">{messages}</div>
      <div className="poster"><div className="poster-card"><h2>Расчёт не выполнен</h2><p>Исправьте входные данные — см. сообщения в научном виде.</p></div></div>
    </>;
  }

  const { totals, rows, limits } = result;


  const dep = depositionHtml(rows);

  const provRows = [];
  rows.forEach(r => r.provenance.forEach(p => provRows.push({ ...p, nuclide: r.nuclide })));

  const hasRu = !!(input.foodGroupCode && limits.ru.length), hasForeign = limits.foreign.length > 0;
  // #FR-59: группы таблиц в одну колонку (расчёт с источниками, нормы РФ, зарубежные); последняя группа тянется до низа
  const span = input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${input.years} ${yearsWord(input.years)}`;
  // #FR-81 V13 (D-022): вкладки — нормы РФ, нормы других стран, сравнение, бытовые риски, подробно, расчёт и источники
  const tabs = [limits.intervention && { id: 'uv', label: 'Уровни вмешательства' }, hasRu && { id: 'ru', label: 'Нормы РФ и ЕАЭС' }, hasForeign && { id: 'foreign', label: 'Нормы других стран' }, result.comparison && { id: 'cmp', label: 'Сравнение с облучением' }, result.lifeRisks && { id: 'life', label: `Бытовые риски за ${span}` }, { id: 'ref', label: 'Подробно (для специалиста)' }, { id: 'src', label: 'Расчёт и источники' }].filter(Boolean);
  const curTab = tabs.some(t => t.id === rt) ? rt : tabs[0].id;
  const grp = (key, grow) => ({ className: 'rgroup' + (grow ? ' grow' : '') });
  const massKg = input.portionKg * input.portionsPerYear;

  return <div className="science">
    {messages}
    <div className="resblock">
    {/* #FR-81 V04 (D-022): A — риск, B — соответствие нормам, C — доза и нормы; KpiGrid уходит во вкладку «Подробно» (V13) */}
    <RiskSummary result={result} input={input} />
    <VerdictBox result={result} input={input} />
    <DoseBlock result={result} input={input} />
    </div>


    {tabs.length > 0 && <div className="rtabs"><div className="tabs" role="tablist">{tabs.map(t => <button type="button" role="tab" key={t.id} aria-selected={curTab === t.id} className={curTab === t.id ? 'on' : undefined} onClick={() => setRt(t.id)}>{t.label}</button>)}</div>
    <div className="tabbody" role="tabpanel">
    {curTab === 'ru' && <>
      <DataTable rows={limits.ru} cols={[
        { h: 'Нуклид', f: l => l.nuclide },
        { h: 'Норматив H', f: l => l.limitId ? `${fmtNum(l.H)} ${unitRu(l.unit)}` : (l.cooked ? 'для готового блюда не установлен' : l.notNormed ? 'не нормируется' : l.reference ? `справочно: ${fmtNum(l.reference.H)} ${unitRu(l.reference.unit)} (другой регламент, в B не входит${l.reference.note ? "; " + l.reference.note : ""})` : 'нет данных в Прил. 4'), c: 'num' },
        { h: 'Активность, Бк/кг', f: l => l.cooked ? fmtNum(l.activity) : l.converted ? <>{fmtNum(l.activity)}<br /><span className="hint">{fmtNum(l.converted.aDry)} / {fmtNum(l.converted.K)}: пересчёт на сырьё</span></> : fmtNum(l.activity), c: 'num' },
        { h: 'Отношение A/H', f: l => fmtNum(l.ratio), c: 'num' },
        // краткое имя документа (до «названия» или скобки), полное — во всплывающей подсказке
        { h: 'Документ и место', f: l => l.document ? <span title={l.document}>{l.document.split(/\s[«(]/)[0]}{locRu(l.loc) ? ` (${locRu(l.loc)})` : ''}</span> : '' }
      ]} />
      {limits.formNote?.kind === 'cooked' && <p className="hint">{T.VERDICT_COOKED}</p>}
      {limits.formNote?.kind === 'no_k' && <p className="msg warn">{T.VERDICT_NO_K}</p>}
      {limits.compliance && (() => {
        const { B, dB, verdict, precisionOk } = limits.compliance;
        return <p>{fmtBLine(B, dB)}, <span className={'verdict ' + verdict}>{verdictText(verdict)}</span>{!precisionOk && ' Точность измерения не удовлетворяет ΔB ≤ 0,3 (МУК 2.6.1.1194-03 п. 6.5)'}</p>;
      })()}
      {limits.productCaption && <p className="hint" id="productCaption">{fill(T.VERDICT_CAPTION, { entry: limits.productName, caption: limits.productCaption })}</p>}
    </>}

    {curTab === 'uv' && limits.intervention && <>
      <p className="hint" id="uvNote">{T.UV_NOTE}</p>
      <DataTable rows={limits.intervention} cols={[
        { h: 'Нуклид', f: l => l.nuclide },
        { h: 'Уровень вмешательства', f: l => l.uv == null ? T.UV_NOT_SET : `${fmtNum(l.uv)} ${unitRu(l.unit)}`, c: 'num' },
        { h: 'Активность, Бк/кг', f: l => fmtNum(l.activity), c: 'num' },
        { h: 'Отношение A/УВ', f: l => l.ratio == null ? '' : fmtNum(l.ratio), c: 'num' },
        { h: 'Документ и место', f: l => l.uv == null ? '' : `НРБ-99/2009, Прил. 2а${locRu(l.loc) ? ` (${locRu(l.loc)})` : ''}` }
      ]} />
    </>}

    {curTab === 'foreign' && hasForeign && (() => {
      const cls = (limits.foreignClasses || []).map(c => FOOD_CLASS_RU[c] || c).join(', ');
      return <>
        <p className="hint">Цезий и стронций{cls ? ` — категория: ${cls}` : ''}.</p>
        {limits.foreign.some(l => l.emergency) && <p className="hint">Аварийные уровни (Codex, Euratom 2016/52, FDA) действуют только после радиационной аварии; уровень FDA — ориентир для решения, не допустимый уровень и не предел для продукта на рынке. Сила каждого документа указана в колонке.</p>}
        {!input.foodGroupCode && <p className="hint">Группа продукта не выбрана — показаны нормы для прочих пищевых продуктов.</p>}
        <DataTable rows={limits.foreign} cols={[
          { h: 'Нуклид', f: l => l.nuclides.join(' + ') }, // #FR-81 E10
          { h: 'Юрисдикция', f: l => JUR_RU[l.jurisdiction] || l.jurisdiction },
          { h: 'Сила документа', f: l => l.force?.label || '', c: l => l.force?.rank === 3 ? 'muted' : '' },
          { h: 'Документ', f: l => l.document },
          { h: 'Категория', f: l => l.food_category_ru },
          { h: 'Норматив, Бк/кг', f: l => fmtNum(l.value), c: 'num' },
          { h: 'A/норматив', f: l => fmtNum(l.ratio), c: l => `num${l.ratio > 1 ? ' lvl-w' : ''}` },
          { h: 'Условия', raw: true, c: 'cond', f: l => {
            const s = String(l.sum_rule || ''), cut = s.search(/\.\s/), sp = s.lastIndexOf(' ', 70);
            const head = s.length <= 90 ? s : cut > 0 && cut < 90 ? s.slice(0, cut + 1) : s.slice(0, sp > 0 ? sp : 70);
            const rest = s.slice(head.length).trim();
            return <>
              {head}{rest && !/\.$/.test(head) ? '…' : ''}
              {(rest || l.loc) && <details><summary>подробнее</summary>{rest ? <p>{rest}</p> : ''}{l.loc ? <p>Место: {locRu(l.loc)}</p> : ''}</details>}
            </>;
          }}
        ]} />
      </>;
    })()}
    {curTab === 'ref' && <Reference result={result} input={input} />}
    {curTab === 'cmp' && <Compare comparison={result.comparison} input={input} radonC={radonC} setRadonC={setRadonC} dwellU={dwellU} setDwellU={setDwellU} />}
    {curTab === 'life' && <LifeRisks life={result.lifeRisks} input={input} />}
    {curTab === 'src' && <>
    <fieldset {...grp('calc', false)}><legend>Расчёт по нуклидам</legend>
    <DataTable rows={rows} cols={[
      { h: 'Нуклид', f: r => r.nuclide },
      { h: 'A, Бк/кг', f: r => fmtNum(r.rawBqPerKg), c: 'num' },
      { h: 'Fr', f: r => fmtNum(r.frUsed), c: 'num' },
      { h: 'M, кг/год', f: () => fmtNum(massKg), c: 'num' },
      { h: 'e, Зв/Бк', f: r => fmtSci(r.eSvPerBq), c: 'num' },
      { h: 'Доза, мкЗв/год', f: r => fmtNum(r.doseSvPerYear * 1e6), c: 'num' },
      { h: 'Орган с наибольшей дозой, за 1 год питания', f: r => { const o = result.organs?.byNuclide?.find(x => x.nuclide === r.nuclide); return o ? `${o.label}: ${fmtNum(o.doseSvPerYear * 1e6)} мкЗв${o.ratio != null ? `, ×${fmtNum(o.ratio, 2)} к эффективной дозе` : ''}` : '—'; } }
    ]} />
    <details className="more"><summary>Поступление, риск и ПГП по нуклидам</summary>
      <DataTable rows={rows} cols={[
        { h: 'Нуклид', f: r => r.nuclide },
        { h: 'Поступление, Бк/год', f: r => fmtNum(r.intakeBqPerYear), c: 'num' },
        { h: 'Пожизненный риск за период', f: r => fmtRiskPerMillion(r.riskTotal), c: 'num' },
        { h: 'ПГП, Бк/год', f: r => r.natural ? 'не нормируется' : fmtNum(r.pgpBqPerYear), c: 'num' },
        { h: 'Доля ПГП', f: r => r.natural ? '—' : fmtPct(r.pgpShare), c: 'num' }
      ]} />
    </details>

    {/* #FR-81 шаг 4а: Y-90 — отдельная добавка к Sr-90 */}
    {rows.filter(r => r.y90).map(r => <p className="hint" key={'y90' + r.nuclide}>Иттрий-90 в продукте при {r.nuclide}: {r.y90.included ? 'включён в дозу (отметка в форме)' : 'не включён'}; отдельная добавка в равновесии — {fmtNum(r.y90.doseSvPerYear * 1e6)} мкЗв за 1-й год, {fmtNum(r.y90.doseSvTotal * 1e6)} мкЗв за весь срок (+{fmtNum(r.y90.ratio * 100)} % к дозе {r.nuclide} 1-го года). В e(g) стронция-90 входит только иттрий, образовавшийся в теле (МКРЗ 119 п. 16); иттрий, уже бывший в продукте, — отдельное поступление.</p>)}
    {rows.some(r => r.lifetimeBands) && <details className="more"><summary>Доза по возрастным группам (питание {input.lifetime.fromAge}–{input.lifetime.toAge} лет)</summary>
      <DataTable rows={rows.flatMap(r => (r.lifetimeBands || []).map(b => ({ ...b, nuclide: r.nuclide })))} cols={[
        { h: 'Нуклид', f: b => b.nuclide },
        { h: 'Возрастная группа', f: b => AGE_LABEL[b.age] || b.age },
        { h: 'Лет', f: b => fmtNum(b.years), c: 'num' },
        { h: 'e, Зв/Бк', f: b => fmtSci(b.eSvPerBq), c: 'num' },
        { h: 'Доза, мкЗв', f: b => fmtNum(b.doseSv * 1e6), c: 'num' }
      ]} />
    </details>}

    {dep && <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: dep }} />}

    </fieldset>
    <p className="hint">Описание каждого документа и методика расчёта — на странице <a href="sources.html">«Справка»</a>.</p>
    <DataTable rows={provRows} cols={[
      { h: 'Величина', f: p => `${p.nuclide} · ${p.step}${p.what ? ': ' + p.what : ''}` },
      { h: 'Значение', f: p => `${fmtNum(p.value)} ${unitRu(p.unit)}`.trim(), c: 'num' },
      { h: 'Источник', html: true, f: p => sourceFull(p.source) + (p.loc ? ', ' + esc(locRu(p.loc)) : '') + (p.level ? ` <span class="chip ${levelClass(p.level)}">${esc(p.level)}</span>` : '') + (p.note ? `<br><span style="color:var(--muted)">${esc(p.note)}</span>` : '') }
    ]} />
    </>}
    </div></div>}

    {meta && <p className="hint">Данные: {meta.datasets} наборов, {meta.records} записей, sha {meta.sha.slice(0, 8)}</p>}
  </div>;
}
