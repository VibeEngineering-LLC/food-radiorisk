import { useState, useEffect } from 'react';
import { loadExt, saveExt } from './persist.js';
import { esc, fmtNum, fmtNear, fmtBLine, fmtSci, fmtDose, fmtRiskPerMillion, fmtPct, levelClass, levelWord, verdictText, nb } from '../ui/fmt.js';
import { depositionHtml } from '../ui/product.js';
import { AGE_LABEL, SOURCE_LABEL } from '../ui/form.js';
import { locRu, unitRu } from '../ui/ru.js';
import { FOOD_CLASS_RU } from '../calc/foodclass.js';
import { sourceFull, JUR_RU, yearsWord } from '../ui/render.js';
import { T, fill } from '../ui/texts_v.js';
import { VerdictBox, DoseBlock } from './Summary.jsx';
import SummaryTab from './SummaryTab.jsx';
import DetailCalc from './DetailCalc.jsx';
import Compare from './Compare.jsx';
import LifeRisks from './LifeRisks.jsx';
import { effectiveInputs } from '../calc/ext_inputs.js';
import { doseZone, ZONE_WORD } from '../calc/dose_zone.js';
import Limits from './Limits.jsx'; // #FR-121: «Известные ограничения» и лицензии — в конце вкладки «Источники»
import Bibliography from './Bibliography.jsx';import Reference from './Reference.jsx';
import RadonWater from './RadonWater.jsx';

export function Kpi({ value, unit, label, level, row }) {
  return <div className={'kpi' + (level ? ' risk-' + level : '')}>{row && <div className="krow">{row}</div>}<div className="v">{value}{unit && <span className="u"> {unit}</span>}</div><div className="l">{label}</div></div>;
}

// доля нормы: ≤ 1 % — пренебрежимо (как 10 мкЗв от 1 мЗв, НРБ п. 1.4), ≤ 100 % — в пределах, иначе превышение
const shareLvl = (s) => !Number.isFinite(s) ? '' : s <= 0.01 ? 'negligible' : s <= 1 ? 'within' : 'exceeds';

// карточка нормы: доля техногенной дозы от предела; если нуклиды только природные — «не нормируется»
// #FR-120: цвет карточки доли нормы — по зоне дозы (level), слово зоны в подписи; уровни 10 мкЗв/год, 1 мЗв/год, 5 мЗв — из totals
function normKpi(share, limitLabel, totals, level = shareLvl(share)) {
  const nat = totals.naturalNuclides.join(', ');
  if (share == null) return <Kpi value="не нормируется" label={nb(`природные радионуклиды (${nat}): предел дозы не установлен (НРБ-99/2009 п. 3.1.3, 5.3.1)`)} />;
  const only = nat ? `; учтены только техногенные (${totals.techNuclides.join(', ')}), природные (${nat}) не нормируются` : '';
  return <Kpi value={fmtPct(share)} label={nb(`${level ? ZONE_WORD[level] + ': ' : ''}${limitLabel}${only}`)} level={level} />;
}

// Карточки итогов: строки — 1 год и весь период, столбцы — доза, риск, доля нормы НРБ
export function KpiGrid({ totals, input }) {
  // e(g) — ожидаемая доза: взрослому за 50 лет после поступления, ребёнку до 70 лет возраста (МКРЗ 103)
  const horizon = input.age === 'adult' ? 'за 50 лет' : 'до 70 лет возраста'; // #FR-99: без «за до»
  const who = nb(`Доза от поступления за 1 год, накопленная ${horizon} (${(AGE_LABEL[input.age] || input.age).toLowerCase()}); ${SOURCE_LABEL[input.doseSource] || input.doseSource}`);
  const n = input.years, span = input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${n} ${yearsWord(n)}`;
  // #FR-115 (оператор 2026-10-11): левой колонки подписей строк нет — название строки стоит внутри карточки дозы над числом (дубль подписи слева убран)
  return <div className="kgrid">
    <div className="kh">Ожидаемая эффективная доза</div><div className="kh">Доля нормы <abbr title="Нормы радиационной безопасности">НРБ</abbr>-99/2009</div>
    {/* #FR-81 V13: справочная сетка вкладки «Подробно»: доза и доля нормы; риск — только главное число и строки вкладки */}
    <Kpi row="1-й год потребления" value={fmtDose(totals.doseSvPerYear)} label={who} />
    {normKpi(totals.maxYearShare5mSv, 'наибольшая годовая доза — от предела 5 мЗв в один год (табл. 3.1)', totals, doseZone(totals.doseMaxYearTech, totals.optimNegligibleSv, totals.limitMaxYearSv))}
    <Kpi row="Ē₅ за 5 лет подряд" value={fmtDose(totals.doseSvAvg5)} label="в год, в среднем за любые 5 лет подряд (за пределами срока доза от продукта 0)" />
    {normKpi(totals.budgetShare1mSvAvg5, 'Ē₅ от предела 1 мЗв/год (табл. 3.1, п. 5.2.4)', totals, doseZone(totals.doseTechAvg5, totals.optimNegligibleSv, totals.limitYearSv))}
    {n > 1 && <>
      <Kpi row={input.lifetime ? `Весь срок потребления, ${span}` : 'Весь срок потребления'} value={fmtDose(totals.doseSvTotal)} label={input.lifetime ? 'вся доза от потребления продукта в этот период, накопленная до 70 лет возраста' : `вся доза от поступления за ${n} ${yearsWord(n)} (сумма по годам), накопленная за ${horizon} после каждого поступления`} />
      {normKpi(totals.lifeShare70mSv, 'от 70 мЗв за период жизни 70 лет (п. 3.1.4)', totals)}
    </>}
  </div>;
}

export function DataTable({ rows, cols, className }) {
  if (!rows.length) return null;
  // заголовок числовой колонки выравнивается так же, как числа под ним (класс num у ячеек первой строки)
  const numCol = (c) => /\bnum\b/.test((typeof c.c === 'function' ? c.c(rows[0]) : c.c) || '');
  const nbv = (v) => typeof v === 'string' ? nb(v) : v; // #FR-124: число и единица в ячейках — неразрывным пробелом
  return <div className="tablewrap"><table className={className}><thead><tr>{cols.map((c, i) => <th key={i}>{numCol(c) ? <span style={{ display: 'block', textAlign: 'right' }}>{nbv(c.h)}</span> : nbv(c.h)}</th>)}</tr></thead><tbody>
    {rows.map((r, ri) => <tr key={ri}>
      {cols.map((c, ci) => {
        const cls = (typeof c.c === 'function' ? c.c(r) : c.c) || '';
        return c.html
          ? <td key={ci} className={cls || undefined} dangerouslySetInnerHTML={{ __html: nb(c.f(r)) }} />
          : <td key={ci} className={cls || undefined}>{nbv(c.f(r))}</td>;
      })}
    </tr>)}
  </tbody></table></div>;
}

export default function Result({ result, input, meta, initialTab = '', onRegion }) {
  // #FR-66: нормы РФ, зарубежные нормы и источники — одна вкладочная группа
  const [rt, setRt] = useState(initialTab); // initialTab — для тестов: открыть нужную вкладку при серверном рендере
  const [ext0] = useState(loadExt); // #FR-89 v29: сохранённые значения полей «Сравнения» (старое состояние без них — умолчания)
  const [ctN, setCtN] = useState(ext0.ctN); // #FR-101: КТ в год (NaN — не введено, умолчание региона)
  const [xrayN, setXrayN] = useState(ext0.xrayN); // #FR-101: рентгенографий и флюорографий в год (NaN — не введено, умолчание региона)
  const [flightN, setFlightN] = useState(ext0.flightN); // перелётов по 3 ч в год
  const [radonC, setRadonC] = useState(ext0.radonC); // #FR-73: ОА радона-222 дома, Бк/м³ — состояние здесь, чтобы не сбрасывалось при смене вкладки
  const [dwellU, setDwellU] = useState(ext0.dwellU);
  useEffect(() => { saveExt({ radonC, dwellU, ctN, xrayN, flightN }); }, [radonC, dwellU, ctN, xrayN, flightN]); // #FR-74: мощность дозы в жилище, мкЗв/ч (пусто — строки нет)
  const messages = [];
  result.errors.forEach(e => messages.push(<div key={e} className="msg err">{nb(e)}</div>));
  result.warnings.forEach(w => messages.push(<div key={w} className="msg warn">{nb(w)}</div>));
  if (!input.foodGroupCode && result.limits?.ruNone) messages.push(<div key="nogroup" className="msg warn">{result.limits.intervention ? T.VERDICT_UV : fill(T.VERDICT_NO_RU_NORM, { entry: result.limits.productName })}</div>); // v14 п. 7: у воды из колодца — уровни вмешательства НРБ-99/2009, а не «норматива нет» // #FR-85 v11: норматива РФ у продукта нет — так и сказано в результате
  else if (!input.foodGroupCode) messages.push(<div key="nogroup" className="msg warn">Группа продукта по ТР ТС 021/2011 не определена по названию — выберите её на вкладке «3 · Потребитель и нормы». Без группы нормы РФ и ЕАЭС не показываются, а зарубежные берутся для прочих пищевых продуктов.</div>);

  if (!result.ok) {
    return <>
      <div className="science">{messages}</div>
      <div className="poster"><div className="poster-card"><h2>Расчёт не выполнен</h2><p>Исправьте входные данные — см. сообщения выше.</p></div></div>
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
  // #FR-89: три новые вкладки (Сводка, Соответствие нормам, Подробный расчёт), затем прежние «Сравнение с облучением», «Бытовые риски», «Расчёт и источники»
  const tabs = [{ id: 'sum', label: 'Сводка' }, result.comparison && { id: 'cmp', label: 'Сравнение доз' }, result.lifeRisks && { id: 'life', label: `Бытовые риски за ${result.lifeRisks.lifetime?.H ?? span} ${yearsWord(result.lifeRisks.lifetime?.H ?? 0)}` }, { id: 'norms', label: 'Соответствие нормам' }, { id: 'calc', label: 'Подробный расчёт' }, { id: 'site', label: 'Место сбора и величины' }, { id: 'spec', label: 'Для специалиста' }, { id: 'src', label: 'Источники' }].filter(Boolean);
  const curTab = tabs.some(t => t.id === rt) ? rt : tabs[0].id;
  const eiR = result.comparison ? effectiveInputs(result.comparison.parts, { radonC, dwellU, ctN, xrayN, flightN }) : null; // #FR-101: действующий радон (введённый или умолчание региона) — и для «Бытовых рисков»
  const grp = (key, grow) => ({ className: 'rgroup' + (grow ? ' grow' : '') });
  const massKg = input.portionKg * input.portionsPerYear;

  return <div className="science">
    {messages}
    {/* #FR-89: один блок вкладок; прежние карточки риска, соответствия и дозы переехали во вкладки «Сводка» и «Соответствие нормам» */}

    {tabs.length > 0 && <div className="rtabs"><div className="tabs" role="tablist">{tabs.map(t => <button type="button" role="tab" key={t.id} aria-selected={curTab === t.id} className={curTab === t.id ? 'on' : undefined} onClick={() => setRt(t.id)}>{t.label}</button>)}</div>
    <div className="tabbody" role="tabpanel">
    {curTab === 'sum' && <SummaryTab result={result} input={input} radonC={radonC} dwellU={dwellU} ctN={ctN} xrayN={xrayN} flightN={flightN} onRegion={onRegion} />}
    {curTab === 'norms' && <>
      <VerdictBox result={result} input={input} />
      <DoseBlock result={result} input={input} />
    </>}
    {curTab === 'norms' && result.radon && <RadonWater radon={result.radon} />}{/* #FR-126: радон-222 в питьевой воде — вдыхание отдельной строкой и нормативы */}
    {curTab === 'norms' && hasRu && <>
      <h4 className="subhead">Нормы РФ и <abbr title="Евразийский экономический союз">ЕАЭС</abbr> (показатель B)</h4>
      <DataTable rows={limits.ru} cols={[
        { h: 'Радионуклид', f: l => l.nuclide },
        { h: 'Норматив H', f: l => l.limitId ? nb(`${fmtNum(l.H)} ${unitRu(l.unit)}`) : (l.cooked ? 'для готового блюда не установлен' : l.notNormed ? 'не нормируется' : l.reference ? nb(`справочно: ${fmtNum(l.reference.H)} ${unitRu(l.reference.unit)} (другой регламент, в B не входит${l.reference.note ? "; " + l.reference.note : ""})`) : 'нет данных в Прил. 4'), c: 'num' },
        { h: 'Удельная активность, Бк/кг', f: l => l.cooked ? fmtNum(l.activity) : l.converted ? <>{fmtNum(l.activity)}<br /><span className="hint">{fmtNum(l.converted.aDry)} / {fmtNum(l.converted.K)}: пересчёт на сырьё</span></> : fmtNum(l.activity), c: 'num' },
        { h: 'Отношение A/H', f: l => fmtNum(l.ratio), c: 'num' },
        // краткое имя документа (до «названия» или скобки), полное — во всплывающей подсказке
        { h: 'Документ и место', f: l => l.document ? <span title={l.document}>{l.document.split(/\s[«(]/)[0]}{locRu(l.loc) ? ` (${locRu(l.loc)})` : ''}</span> : '' }
      ]} />
      {limits.formNote?.kind === 'cooked' && <p className="hint">{T.VERDICT_COOKED}</p>}
      {limits.formNote?.kind === 'no_k' && <p className="msg warn">{T.VERDICT_NO_K}</p>}
      {limits.compliance && (() => {
        const { B, dB, verdict, precisionOk } = limits.compliance;
        return <p>{fmtBLine(B, dB)}, <span className={'verdict ' + verdict}>{verdictText(verdict)}</span>{!precisionOk && nb(' Точность измерения не удовлетворяет ΔB ≤ 0,3 (МУК 2.6.1.1194-03 п. 6.5)')}</p>;
      })()}
      {limits.productCaption && <p className="hint" id="productCaption">{fill(T.VERDICT_CAPTION, { entry: limits.productName, caption: limits.productCaption })}</p>}
    </>}

    {curTab === 'norms' && limits.intervention && <>
      <h4 className="subhead">Уровни вмешательства (НРБ-99/2009, Прил. 2а)</h4>
      <p className="hint" id="uvNote">{T.UV_NOTE}</p>
      <DataTable rows={limits.intervention} cols={[
        { h: 'Радионуклид', f: l => l.nuclide },
        { h: 'Уровень вмешательства (УВ)', f: l => l.uv == null ? T.UV_NOT_SET : nb(`${fmtNum(l.uv)} ${unitRu(l.unit)}`), c: 'num' },
        { h: 'Удельная активность, Бк/кг', f: l => fmtNum(l.activity), c: 'num' },
        { h: 'Отношение A/УВ', f: l => l.ratio == null ? '' : fmtNum(l.ratio), c: 'num' },
        { h: 'Документ и место', f: l => l.uv == null ? '' : `${l.doc || 'НРБ-99/2009, Прил. 2а'}${locRu(l.loc) ? ` (${locRu(l.loc)})` : ''}` }
      ]} />
    </>}

    {curTab === 'norms' && hasForeign && (() => {
      const cls = (limits.foreignClasses || []).map(c => FOOD_CLASS_RU[c] || c).join(', ');
      return <>
        <h4 className="subhead">Нормы других стран</h4>
        <p className="hint">{limits.foreign.every(l => l.nuclides.every(x => x === 'Rn-222')) ? 'Радон-222' : 'Цезий и стронций'}{cls ? ` — категория: ${cls}` : ''}.</p>
        {limits.foreign.some(l => l.emergency) && <p className="hint">Аварийные уровни (Кодекс Алиментариус, Евратом 2016/52, Управление по санитарному надзору за качеством пищевых продуктов и медикаментов США, FDA) действуют только после радиационной аварии; уровень FDA — ориентир для решения, не допустимый уровень и не предел для продукта на рынке. Юридическая сила каждого документа указана в колонке.</p>}
        {(() => { const K = limits.foreign.find(l => l.reconstitution > 1)?.reconstitution; return K ? <p className="hint">{fill(T.NORMS_FOREIGN_DRIED, { K: fmtNum(K) })}</p> : null; })()}
        {!input.foodGroupCode && <p className="hint">Группа продукта не выбрана — показаны нормы для прочих пищевых продуктов.</p>}
        <DataTable rows={limits.foreign} cols={[
          { h: 'Радионуклид', f: l => l.nuclides.join(' + ') }, // #FR-81 E10
          { h: 'Юрисдикция', f: l => JUR_RU[l.jurisdiction] || l.jurisdiction },
          { h: 'Юридическая сила документа', f: l => l.force?.label || '', c: l => l.force?.rank === 3 ? 'muted' : '' },
          { h: 'Документ', f: l => l.document },
          { h: 'Категория', f: l => l.food_category_ru },
          { h: 'Норматив, Бк/кг', f: l => fmtNum(l.value), c: 'num' },
          { h: 'A/норматив', f: l => fmtNum(l.ratio), c: l => `num${l.ratio > 1 ? ' lvl-w' : ''}` },
          { h: 'Условия', raw: true, c: 'cond', f: l => {
            const s = String(l.sum_rule || ''), cut = s.search(/\.\s/), sp = s.lastIndexOf(' ', 70);
            const head = s.length <= 90 ? s : cut > 0 && cut < 90 ? s.slice(0, cut + 1) : s.slice(0, sp > 0 ? sp : 70);
            const rest = s.slice(head.length).trim();
            return <>
              {nb(head)}{rest && !/\.$/.test(head) ? '…' : ''}
              {(rest || l.loc) && <details><summary>подробнее</summary>{rest ? <p>{nb(rest)}</p> : ''}{l.loc ? <p>Место: {nb(locRu(l.loc))}</p> : ''}</details>}
            </>;
          }}
        ]} />
      </>;
    })()}
    {/* #FR-92 v30: все расчёты — на вкладке «Подробный расчёт»: вход → поступление → доза по годам → доза по нуклидам и органам, поступление/риск/ПГП, плотность загрязнения → справочные величины; «Источники» — только источники */}
    {curTab === 'calc' && <DetailCalc result={result} input={input} ext={{ radonC, dwellU, ctN, xrayN, flightN }} />}
    {/* #FR-113 (оператор 2026-10-11): плотность загрязнения места сбора и таблица значений величин — отдельная вкладка (без оценки загрязнения — только таблица значений) */}
    {curTab === 'site' && <>
      {dep && <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: dep }} />}
      <h4 className="subhead">Значения величин и их источники</h4>
      <DataTable rows={provRows} cols={[
        { h: 'Величина', f: p => `${p.nuclide} · ${p.step}${p.what ? ': ' + p.what : ''}` },
        { h: 'Значение', f: p => nb(`${fmtNum(p.value)} ${unitRu(p.unit)}`.trim()), c: 'num' },
        { h: 'Источник', html: true, f: p => nb(sourceFull(p.source) + (p.loc ? ', ' + esc(locRu(p.loc)) : '') + (p.level ? ` <span class="chip ${levelClass(p.level)}">${esc(levelWord(p.level))}</span>` : '') + (p.note ? `<br><span style="color:var(--muted)">${esc(p.note)}</span>` : '')) }
      ]} />
    </>}
    {/* #FR-112 (оператор 2026-10-11): справочные величины для специалиста и всё, что ниже, — отдельная вкладка после «Подробного расчёта» */}
    {curTab === 'spec' && <>
      <h4 className="subhead">Справочные величины для специалиста</h4>
      <Reference result={result} input={input} />
    </>}
    {curTab === 'cmp' && <Compare comparison={result.comparison} input={input} radonC={radonC} setRadonC={setRadonC} dwellU={dwellU} setDwellU={setDwellU} ctN={ctN} setCtN={setCtN} xrayN={xrayN} setXrayN={setXrayN} flightN={flightN} setFlightN={setFlightN} onRegion={onRegion} />}
    {curTab === 'life' && <LifeRisks life={result.lifeRisks} input={input} radonC={eiR?.radonC} radonIsDefault={eiR ? eiR.radonIsDefault : true} onRegion={onRegion} />}
    {(curTab === 'src' || curTab === 'calc') && <>
    {curTab === 'calc' && <fieldset {...grp('calc', false)}><legend>Расчёт по радионуклидам</legend>
    <DataTable rows={rows} cols={[
      { h: 'Радионуклид', f: r => r.nuclide },
      { h: 'A (удельная активность), Бк/кг', f: r => fmtNum(r.rawBqPerKg), c: 'num' },
      { h: 'Fr (доля активности, остающаяся после обработки)', f: r => fmtNum(r.frUsed), c: 'num' },
      { h: 'M (масса продукта), кг/год', f: () => fmtNum(massKg), c: 'num' },
      { h: 'e(g) (дозовый коэффициент), Зв/Бк', f: r => fmtSci(r.eSvPerBq), c: 'num' },
      { h: 'Ожидаемая эффективная доза от поступления за 1 год, мкЗв', f: r => fmtNum(r.doseSvPerYear * 1e6), c: 'num' },
      { h: 'Орган с наибольшей дозой (поступление за 1 год)', f: r => { const o = result.organs?.byNuclide?.find(x => x.nuclide === r.nuclide); return o ? nb(`${o.label}: ${fmtNum(o.doseSvPerYear * 1e6)} мкЗв${o.ratio != null ? `, ×${fmtNum(o.ratio, 2)} к эффективной дозе` : ''}`) : '—'; } }
    ]} />
    <details className="more" open><summary>Поступление, риск и предел годового поступления (ПГП) по радионуклидам</summary>
      <DataTable rows={rows} cols={[
        { h: 'Радионуклид', f: r => r.nuclide },
        { h: 'Поступление за 1-й год с учётом распада в течение года, Бк', f: r => fmtNum(r.intakeBqPerYear), c: 'num' }, // #FR-125: у каждого столбца — смысл и единица
        { h: 'Риск за период потребления, R = r · E (на 1 000 000 человек)', f: r => fmtRiskPerMillion(r.riskTotal), c: 'num' },
        { h: 'Предел годового поступления (ПГП), Бк/год', f: r => r.natural ? 'не нормируется' : fmtNum(r.pgpBqPerYear), c: 'num' },
        { h: 'Доля ПГП, % (поступление года с наибольшей дозой ÷ ПГП)', f: r => r.natural ? '—' : fmtPct(r.pgpShare), c: 'num' }
      ]} />
      <p className="hint">{T.INTAKE_FORMULAS}</p>
    </details>

    {/* #FR-81 шаг 4а: Y-90 — отдельная добавка к Sr-90 */}
    {rows.filter(r => r.y90).map(r => <p className="hint" key={'y90' + r.nuclide}>{nb(`Иттрий-90 в продукте при ${r.nuclide}: ${r.y90.included ? 'включён в дозу (отметка в форме)' : 'не включён'}; отдельная добавка в равновесии — ${fmtNum(r.y90.doseSvPerYear * 1e6)} мкЗв за 1-й год, ${fmtNum(r.y90.doseSvTotal * 1e6)} мкЗв за весь срок (+${fmtNum(r.y90.ratio * 100)} % к дозе ${r.nuclide} 1-го года). В дозовый коэффициент e(g) стронция-90 входит только иттрий, образовавшийся в теле (МКРЗ 119 п. 16); иттрий, уже бывший в продукте, — отдельное поступление.`)}</p>)}
    {rows.some(r => r.lifetimeBands) && <details className="more" open><summary>Доза по возрастным группам (потребление с {input.lifetime.fromAge} до {input.lifetime.toAge} лет)</summary>
      <DataTable rows={rows.flatMap(r => (r.lifetimeBands || []).map(b => ({ ...b, nuclide: r.nuclide })))} cols={[
        { h: 'Радионуклид', f: b => b.nuclide },
        { h: 'Возрастная группа', f: b => AGE_LABEL[b.age] || b.age },
        { h: 'Лет', f: b => fmtNum(b.years), c: 'num' },
        { h: 'e(g), Зв/Бк', f: b => fmtSci(b.eSvPerBq), c: 'num' },
        { h: 'Эффективная доза, мкЗв', f: b => fmtNum(b.doseSv * 1e6), c: 'num' }
      ]} />
    </details>}

    </fieldset>}
    {curTab === 'src' && <>
    <p className="hint">{T.SRC_BIBLIO_NOTE}</p>
    <Bibliography result={result} />
    <Limits />
    </>}
    </>}
    </div></div>}

    {meta && <p className="hint">Данные: {meta.datasets} наборов, {meta.records} записей, контрольная сумма {meta.sha.slice(0, 8)}</p>}
  </div>;
}
