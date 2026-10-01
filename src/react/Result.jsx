import { esc, fmtNum, fmtSci, fmtDose, fmtRiskPerMillion, fmtOneIn, fmtCases, fmtPct, levelClass, verdictText } from '../ui/fmt.js';
import { depositionHtml } from '../ui/product.js';
import { AGE_LABEL, SOURCE_LABEL } from '../ui/form.js';
import { locRu, unitRu } from '../ui/ru.js';
import { FOOD_CLASS_RU } from '../calc/foodclass.js';
import { sourceFull, JUR_RU, yearsWord, RISK_TXT, logPos, doseLvl } from '../ui/render.js';

// #FR-21: склонение слова «раз» для сравнения долей
const razWord = (x) => {
  const n = Number(x.toPrecision(3));
  if (!Number.isInteger(n)) return 'раза';
  const k = n % 100, d = n % 10;
  return (d >= 2 && d <= 4 && !(k >= 12 && k <= 14)) ? 'раза' : 'раз';
};

// Сравнение долей: «в N раз выше» или «N % от»
const vs = (share, what) => share >= 1
  ? [`в ${fmtNum(share)} ${razWord(share)} выше`, what]
  : [`${fmtPct(share)} от`, what];

export function Kpi({ value, label, level }) {
  return <div className={'kpi' + (level ? ' risk-' + level : '')}><div className="v">{value}</div><div className="l">{label}</div></div>;
}

export function RiskBlock({ totals, years }) {
  const ra = totals.riskAssessment;
  if (!ra) return <><div className="n">{fmtRiskPerMillion(totals.riskTotal)}</div><div className="t">добавочный риск за {years} {yearsWord(years)}</div></>;

  const main = years > 1 ? totals.riskTotal : totals.riskPerYear;
  const mark = (v, t) => <i className="tick" style={{ left: `${logPos(v)}%` }} title={t}></i>;

  return <>
    <div className="t"><b>Дополнительные случаи рака за всю жизнь{years > 1 ? ` от ${years} ${yearsWord(years)} потребления` : ' от 1 года потребления'}</b></div>
    <div className="n">{fmtCases(main)} на 1 млн человек</div>
    <div className="t">Вероятность заболеть раком за жизнь возрастает на {(main * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 3, maximumFractionDigits: 20 })} % (дополнительно {fmtOneIn(main).replace('1 из', '1 человек из')}).</div>
    <div className="t">{years > 1 ? `От одного года потребления — ${fmtCases(totals.riskPerYear)} на 1 млн (светлая точка; тёмная — ${years} ${yearsWord(years)}). ` : ''}Это <b>{RISK_TXT[ra.level]}</b></div>
    <div className="riskscale">
      {mark(ra.negligible.value, '10⁻⁶ пренебрежимо малый')}
      {mark(ra.limit.value, '5·10⁻⁵ НРБ п. 2.3')}
      {totals.riskPerYear > 0 && <b className="dot" style={{ left: `${logPos(totals.riskPerYear)}%` }}></b>}
      {years > 1 && totals.riskTotal > 0 && <b className="dot dot2" style={{ left: `${logPos(totals.riskTotal)}%` }}></b>}
    </div>
    <div className="scalelbl">
      <span style={{ left: '0' }}>0,01 на млн</span>
      <span style={{ left: `${logPos(ra.negligible.value)}%` }}>1</span>
      <span style={{ left: `${logPos(ra.limit.value)}%` }}>50</span>
      <span style={{ left: '100%' }}>1000 на млн</span>
    </div>
    <p className="hint risksrc">Уровни риска: НРБ-99/2009, {(ra.limit.loc || 'п. 2.3').replace(/PDF p\./g, 'с. PDF ')}; риск = доза × коэффициент номинального риска (ICRP 103, табл. 1; НРБ-99/2009, п. 2.3), линейная беспороговая модель. Пределы доз населения установлены по пожизненному риску от облучения в течение года (НРБ-99/2009, п. 2.3).</p>
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
  const dl = doseLvl(totals.doseSvPerYear);

  // D-019: четыре плитки в ряд, как в окне программы; за период — ещё две, если лет больше одного
  const who = `${AGE_LABEL[input.age] || input.age}; ${SOURCE_LABEL[input.doseSource] || input.doseSource}`;
  const kpis = [
    <Kpi key="dose1" value={fmtDose(totals.doseSvPerYear)} label={`Доза за год (${who})`} level={dl} />,
    <Kpi key="risk1" value={`${fmtCases(totals.riskPerYear)} на 1 млн`} label="Доп. случаи рака за всю жизнь от 1 года потребления (ЛБМ, ICRP 103)" level={totals.riskAssessment?.level} />
  ];

  const [vs1, vs1Label] = vs(totals.budgetShare1mSv, 'предела 1 мЗв/год на пищевой путь (МУК 2.6.1.1194-03)');
  kpis.push(<Kpi key="vs1" value={vs1} label={vs1Label} level={dl} />);

  const [vs2, vs2Label] = vs(totals.negligibleShare, 'пренебрежимо малой дозы 10 мкЗв/год (НРБ-99/2009 п. 1.4)');
  kpis.push(<Kpi key="vs2" value={vs2} label={vs2Label} level={dl} />);
  if (input.years > 1) {
    kpis.push(<Kpi key="dose2" value={fmtDose(totals.doseSvTotal)} label={`Доза за ${input.years} ${yearsWord(input.years)}`} level={dl} />);
    kpis.push(<Kpi key="risk2" value={`${fmtCases(totals.riskTotal)} на 1 млн`} label={`Доп. случаи рака за всю жизнь от ${input.years} ${yearsWord(input.years)} потребления`} />);
  }

  const dep = depositionHtml(rows);

  const provRows = [];
  rows.forEach(r => r.provenance.forEach(p => provRows.push({ ...p, nuclide: r.nuclide })));

  const hasRu = !!(input.foodGroupCode && limits.ru.length), hasForeign = limits.foreign.length > 0;
  // D-019: группы таблиц в две колонки (слева расчёт и нормы, справа источники); последняя группа колонки тянется до низа
  const grp = (key, grow) => ({ className: 'rgroup' + (grow ? ' grow' : '') });
  const massKg = input.portionKg * input.portionsPerYear;

  return <div className="science">
    {messages}
    <div className="resblock">
    <div className="kpis">{kpis}</div>
    <div className={'riskbox risk risk-' + (totals.riskAssessment?.level || 'none')}><RiskBlock totals={totals} years={input.years} /></div>
    </div>

    <div className="rgrid"><div className="rcol">
    <fieldset {...grp('calc', !hasRu && !hasForeign)}><legend>Расчёт по нуклидам</legend>
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
        { h: 'ПГП, Бк/год', f: r => fmtNum(r.pgpBqPerYear), c: 'num' },
        { h: 'Доля ПГП', f: r => fmtPct(r.pgpShare), c: 'num' }
      ]} />
    </details>

    {dep && <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: dep }} />}
    </fieldset>

    {hasRu && <fieldset {...grp('ru', !hasForeign)}><legend>Нормы РФ / ЕАЭС</legend>
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
    </fieldset>}

    {hasForeign && (() => {
      const cls = (limits.foreignClasses || []).map(c => FOOD_CLASS_RU[c] || c).join(', ');
      return <fieldset {...grp('foreign', true)}><legend>Зарубежные нормы</legend>
        <p className="hint">Цезий и стронций{cls ? ` — категория: ${cls}` : ''}.</p>
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
      </fieldset>;
    })()}
    </div>
  <div className="rcol"><fieldset className="gbox rgroup grow"><legend>Источники</legend>
      <DataTable rows={provRows} cols={[
        { h: 'Величина', f: p => `${p.nuclide} · ${p.step}${p.what ? ': ' + p.what : ''}` },
        { h: 'Значение', f: p => `${fmtNum(p.value)} ${unitRu(p.unit)}`.trim(), c: 'num' },
        { h: 'Источник', html: true, f: p => sourceFull(p.source) + (p.loc ? ', ' + esc(locRu(p.loc)) : '') + (p.level ? ` <span class="chip ${levelClass(p.level)}">${esc(p.level)}</span>` : '') + (p.note ? `<br><span style="color:var(--muted)">${esc(p.note)}</span>` : '') }
      ]} />
    </fieldset></div>
    </div>

    {meta && <p className="hint">Данные: {meta.datasets} наборов, {meta.records} записей, sha {meta.sha.slice(0, 8)}</p>}
  </div>;
}
