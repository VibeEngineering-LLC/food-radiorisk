import { useState } from 'react';
import { esc, fmtNum, fmtSci, fmtDose, fmtRiskPerMillion, fmtOneIn, fmtPct, levelClass, verdictText } from '../ui/fmt.js';
import { depositionHtml } from '../ui/product.js';
import { AGE_LABEL, SOURCE_LABEL } from '../ui/form.js';
import { locRu, unitRu } from '../ui/ru.js';
import { FOOD_CLASS_RU } from '../calc/foodclass.js';
import { sourceFull, JUR_RU, yearsWord, RISK_TXT, logPos } from '../ui/render.js';
import Compare from './Compare.jsx';

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
  const mln = (p) => Number.isFinite(p) ? fmtNum(p * 1e6) : '—';
  return <div className={n > 1 ? 'kgrid' : 'kgrid one'}>
    {n > 1 && <div />}<div className="kh">Ожидаемая эффективная доза</div><div className="kh">Пожизненный риск (номинальный)</div><div className="kh">Доля нормы НРБ-99/2009</div>
    {n > 1 && <div className="kr">1 год</div>}
    <Kpi value={fmtDose(totals.doseSvPerYear)} label={who} />
    <Kpi value={mln(totals.riskPerYear)} unit="на 1 млн" label="от 1 года потребления; уровни НРБ п. 2.3 — 1 и 50 на 1 млн" level={totals.riskAssessment?.level} />
    {normKpi(totals.budgetShare1mSv, 'от предела 1 мЗв/год (табл. 3.1, п. 5.2.4)', totals)}
    {n > 1 && <>
      <div className="kr">{span}</div>
      <Kpi value={fmtDose(totals.doseSvTotal)} label={input.lifetime ? 'вся доза от питания в этот период, накопленная за жизнь (до 70 лет)' : `вся доза от поступления за ${n} ${yearsWord(n)} (сумма по годам), накопленная за ${horizon} после каждого поступления`} />
      <Kpi value={mln(totals.riskTotal)} unit="на 1 млн" label="сумма за период; уровня риска для суммы в НРБ нет" />
      {normKpi(totals.lifeShare70mSv, 'от 70 мЗв за период жизни 70 лет (п. 3.1.4)', totals)}
    </>}
  </div>;
}

export function RiskBlock({ totals, years, age }) {
  const horizon = age && age !== 'adult' ? 'до 70 лет возраста' : '50 лет';
  const ra = totals.riskAssessment;
  if (!ra) return <><div className="n">{fmtRiskPerMillion(totals.riskTotal)}</div><div className="t">добавочный риск за {years} {yearsWord(years)}</div></>;

  const main = years > 1 ? totals.riskTotal : totals.riskPerYear;
  const mark = (v, t) => <i className="tick" style={{ left: `${logPos(v)}%` }} title={t}></i>;

  return <>
    <div className="t"><b>Пожизненный радиационный риск{years > 1 ? ` от ${years} ${yearsWord(years)} потребления` : ' от 1 года потребления'}</b></div>
    <div className="n">{fmtNum(main * 1e6)} на 1 млн</div>
    <div className="t">Риск рассчитан по МКРЗ 103 на оставшуюся жизнь: по ожидаемой дозе, накопленной после поступления — взрослому за 50 лет, ребёнку до 70 лет возраста (МКРЗ 103, прил. B, п. (f); здесь: {horizon}).</div>
    <div className="t">В долях: {fmtSci(main)} ({(main * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 3, maximumFractionDigits: 20 })} %, {fmtOneIn(main)}) — в таком виде НРБ-99/2009 задают индивидуальный пожизненный риск.</div>
    <div className="t">Номинальный риск с учётом вреда (МКРЗ 103, табл. 1; НРБ-99/2009, п. 2.3): коэффициент учитывает тяжесть последствий — летальность и потерянные годы жизни (МКРЗ 103, п. A106). Это не число заболевших: частота заболеваний раком на 1 Зв выше (МКРЗ 103, табл. A.4.1).</div>
    <div className="t">{years > 1 ? `Риск от одного года потребления — ${fmtNum(totals.riskPerYear * 1e6)} на 1 млн (точка на шкале). ` : ''}Это <b>{RISK_TXT[ra.level]}</b></div>
    <div className="riskscale">
      {mark(ra.negligible.value, '10⁻⁶ пренебрежимо малый')}
      {mark(ra.limit.value, '5·10⁻⁵ НРБ п. 2.3')}
      {totals.riskPerYear > 0 && <b className="dot" style={{ left: `${logPos(totals.riskPerYear)}%` }}></b>}
    </div>
    <div className="scalelbl">
      <span style={{ left: '0' }}>0,01 на млн</span>
      <span style={{ left: `${logPos(ra.negligible.value)}%` }}>1</span>
      <span style={{ left: `${logPos(ra.limit.value)}%` }}>50</span>
      <span style={{ left: '100%' }}>1000 на млн</span>
    </div>
    {years > 1 && <p className="hint risksrc">Шкала показывает риск от одного года потребления: уровни НРБ заданы для годового облучения. Риск за {years} {yearsWord(years)} — {fmtNum(totals.riskTotal * 1e6)} на 1 млн, это сумма за все годы, и со шкалой его сравнивать нельзя.</p>}
    <p className="hint risksrc">Уровни риска: НРБ-99/2009, {(ra.limit.loc || 'п. 2.3').replace(/PDF p\./g, 'с. PDF ')}; риск = доза × коэффициент номинального риска (ICRP 103, табл. 1; НРБ-99/2009, п. 2.3), линейная беспороговая модель. Пределы доз населения установлены по пожизненному риску от облучения в течение года (НРБ-99/2009, п. 2.3): при усреднённом коэффициенте 0,05 Зв⁻¹ уровни 1 и 50 на 1 млн соответствуют (расчёт: риск / 0,05) 20 мкЗв и 1 мЗв за год; сам предел для населения — 1 мЗв в год в среднем за любые последовательные 5 лет, но не более 5 мЗв в год (табл. 3.1).</p>
    <p className="hint risksrc">Риск номинальный — усреднён по полу и возрасту населения. Это мера для сравнения с нормами, а не прогноз для конкретного человека (МКРЗ, Публ. 103, п. B252).</p>
  </>;
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

export default function Result({ result, input, meta }) {
  // #FR-66: нормы РФ, зарубежные нормы и источники — одна вкладочная группа
  const [rt, setRt] = useState('');
  const [radonC, setRadonC] = useState(100); // #FR-73: концентрация радона дома, Бк/м³ — состояние здесь, чтобы не сбрасывалось при смене вкладки
  const messages = [];
  result.errors.forEach(e => messages.push(<div key={e} className="msg err">{e}</div>));
  result.warnings.forEach(w => messages.push(<div key={w} className="msg warn">{w}</div>));

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
  const tabs = [hasRu && { id: 'ru', label: 'Нормы РФ / ЕАЭС' }, hasForeign && { id: 'foreign', label: 'Зарубежные нормы' }, result.comparison && { id: 'cmp', label: 'Сравнение' }, { id: 'src', label: 'Источники' }].filter(Boolean);
  const curTab = tabs.some(t => t.id === rt) ? rt : tabs[0].id;
  const grp = (key, grow) => ({ className: 'rgroup' + (grow ? ' grow' : '') });
  const massKg = input.portionKg * input.portionsPerYear;

  return <div className="science">
    {messages}
    <div className="resblock">
    <KpiGrid totals={totals} input={input} />
    <div className={'riskbox risk risk-' + (totals.riskAssessment?.level || 'none')}><RiskBlock totals={totals} years={input.years} age={input.age} /></div>
    </div>

    <fieldset {...grp('calc', false)}><legend>Расчёт по нуклидам</legend>
    <DataTable rows={rows} cols={[
      { h: 'Нуклид', f: r => r.nuclide },
      { h: 'A, Бк/кг', f: r => fmtNum(r.rawBqPerKg), c: 'num' },
      { h: 'Fr', f: r => fmtNum(r.frUsed), c: 'num' },
      { h: 'M, кг/год', f: () => fmtNum(massKg), c: 'num' },
      { h: 'e, Зв/Бк', f: r => fmtSci(r.eSvPerBq), c: 'num' },
      { h: 'Доза, мкЗв/год', f: r => fmtNum(r.doseSvPerYear * 1e6), c: 'num' }
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

    {tabs.length > 0 && <div className="rtabs"><div className="tabs" role="tablist">{tabs.map(t => <button type="button" role="tab" key={t.id} aria-selected={curTab === t.id} className={curTab === t.id ? 'on' : undefined} onClick={() => setRt(t.id)}>{t.label}</button>)}</div>
    <div className="tabbody" role="tabpanel">
    {curTab === 'ru' && <>
      <DataTable rows={limits.ru} cols={[
        { h: 'Нуклид', f: l => l.nuclide },
        { h: 'Норматив H', f: l => l.limitId ? `${fmtNum(l.H)} ${unitRu(l.unit)}` : (l.notNormed ? 'не нормируется' : 'нет данных'), c: 'num' },
        { h: 'Активность, Бк/кг', f: l => fmtNum(l.activity), c: 'num' },
        { h: 'Отношение A/H', f: l => fmtNum(l.ratio), c: 'num' },
        // краткое имя документа (до «названия» или скобки), полное — во всплывающей подсказке
        { h: 'Документ и место', f: l => l.document ? <span title={l.document}>{l.document.split(/\s[«(]/)[0]} ({locRu(l.loc)})</span> : '' }
      ]} />
      {limits.compliance && (() => {
        const { B, dB, verdict, precisionOk } = limits.compliance;
        return <p>B = {fmtNum(B)}, ΔB = {fmtNum(dB)}, <span className={'verdict ' + verdict}>{verdictText(verdict)}</span>{!precisionOk && ' Точность измерения не удовлетворяет ΔB ≤ 0,3 (МУК 2.6.1.1194-03 п. 6.5)'}</p>;
      })()}
    </>}

    {curTab === 'foreign' && hasForeign && (() => {
      const cls = (limits.foreignClasses || []).map(c => FOOD_CLASS_RU[c] || c).join(', ');
      return <>
        <p className="hint">Цезий и стронций{cls ? ` — категория: ${cls}` : ''}.</p>
        {limits.foreign.some(l => l.emergency) && <p className="hint">Аварийные уровни (Codex, Euratom 2016/52, FDA) действуют только после радиационной аварии; уровень FDA — ориентир для решения, не допустимый уровень и не предел для продукта на рынке. Сила каждого документа указана в колонке.</p>}
        {!input.foodGroupCode && <p className="hint">Группа продукта не выбрана — показаны нормы для прочих пищевых продуктов.</p>}
        <DataTable rows={limits.foreign} cols={[
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
    {curTab === 'cmp' && <Compare comparison={result.comparison} input={input} radonC={radonC} setRadonC={setRadonC} />}
    {curTab === 'src' && <>
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
