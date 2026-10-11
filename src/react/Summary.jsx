// #FR-81 V04/V15 (D-022): главный экран результата — блоки A (риск), B (соответствие нормам), C (доза и нормы); все строки приходят готовыми из summaryParts
import { summaryParts } from '../ui/summary_text.js';
import { logPos } from '../calc/risk_zone.js';
import { T } from '../ui/texts_v.js';

// #FR-116: шкала рисков с зонами НРБ (возвращена из версии до вкладок): зелёная / янтарная / красная, отметки уровней, кружок-маркер в точке риска
// #FR-117: risk2 — второй, меньший полый маркер (риск за введённый срок), когда главный маркер — риск при питании всю жизнь
function RiskScale({ ra, risk, risk2, legend }) {
  const pos = logPos(risk), at = (v) => `${logPos(v)}%`, pos2 = logPos(risk2);
  return <>
    <div className="riskscale" data-zone={ra.level}>
      <i className="tick" style={{ left: at(ra.negligible.value) }} title={T.RISK_SCALE_TICK_NEGL}></i>
      <i className="tick" style={{ left: at(ra.limit.value) }} title={T.RISK_SCALE_TICK_LIMIT}></i>
      {risk2 > 0 && <b className="dot dot2" style={{ left: `clamp(7px, ${pos2}%, calc(100% - 7px))` }} data-pos2={Math.round(pos2)} title={legend?.term}></b>}
      <b className="dot" style={{ left: `clamp(11px, ${pos}%, calc(100% - 11px))` }} data-pos={Math.round(pos)} title={risk2 > 0 ? legend?.life : undefined}></b>
    </div>
    <div className="scalelbl"><span style={{ left: '0' }}>{T.RISK_SCALE_MIN}</span><span style={{ left: at(ra.negligible.value) }}>1</span><span style={{ left: at(ra.limit.value) }}>50</span><span style={{ left: '100%' }}>{T.RISK_SCALE_MAX}</span></div>
    {risk2 > 0 && legend && <p className="rs-legend">{legend.text}.</p>}
    <p className="hint risksrc">{T.RISK_SCALE_NOTE}</p>
  </>;
}

// Блок A — сводка по риску
export function RiskSummary({ result, input }) {
  const p = summaryParts(result, input);
  const ra1 = result.totals.riskAssessment; // #FR-116: зона риска за введённый срок (null — шкалы нет)
  const eat = result.eating, lifeOk = !!(eat && eat.ok && eat.riskAssessment);
  const ra = lifeOk ? eat.riskAssessment : ra1; // #FR-117: цвет блока и шкала — по пожизненному числу, если оно есть

  // Естественная формулировка — короткий путь
  if (p.natural !== null) {
    return (
      <div className="riskbox rs">
        <h3 className="rs-head">{p.head}</h3>
        <p className="rs-caption">{p.natural}</p>
        <p className="hint">{p.link}</p>
      </div>
    );
  }

  // Полная развёртка: число, подпись, фон, эквивалент, вербальная оценка, примечания
  return (
    <div className={'riskbox rs' + (ra ? ' risk risk-' + ra.level : '')}>
      <h3 className="rs-head">{p.headShort}</h3>
      {/* #FR-123: заголовок один; два числа в одну строку (две колонки), короткие подписи у чисел */}
      <div className="rs-nums">
        <div className="rs-num"><div className="rs-cap">{p.termCap}</div><div className="rs-number">{p.number}</div></div>
        {p.life && <div className="rs-num rs-num-life"><div className="rs-cap">{p.life.cap}</div>
          {p.life.number && <div className="rs-number rs-number-life">{p.life.number}</div>}
          {p.life.unavailable && <p className="msg warn rs-unavail">{p.life.unavailable}</p>}</div>}
      </div>
      {ra && <RiskScale ra={ra} risk={lifeOk ? eat.riskNominal : result.totals.riskNominal} risk2={lifeOk ? result.totals.riskNominal : 0} legend={p.legend} />}
      <p className="rs-caption">{p.caption}</p>
      {p.background && <p className="rs-bg">{p.background}</p>}
      {p.equiv && <p className="rs-eq">{p.equiv}</p>}
      {p.verbal && <p className="rs-verbal">{p.verbal}</p>}
      <ul className="rs-notes">
        {p.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <p className="hint">{p.link}</p>
    </div>
  );
}

// Блок B — вердикт по соответствию нормам
export function VerdictBox({ result, input }) {
  const p = summaryParts(result, input);

  return (
    <div className={'riskbox vb ' + p.verdict.cls}>
      <h4>{p.verdict.title}</h4>
      {p.verdict.lines.map((l, i) => {
        if (l.kind === 'head') {
          return (
            <p key={i}>
              <b>{l.text}</b>
            </p>
          );
        }
        if (l.kind === 'warn') {
          return <p key={i} className="msg warn">{l.text}</p>;
        }
        return <p key={i}>{l.text}</p>;
      })}
      <p className="hint">{p.verdict.sep}</p>
    </div>
  );
}

// Блок C — доза и нормы
export function DoseBlock({ result, input }) {
  const p = summaryParts(result, input);

  return (
    <div className="dose-block">
      <h4>{p.dose.head}</h4>
      {p.dose.lines.map((s, i) => (
        <p key={i} className="hint">{s}</p>
      ))}
    </div>
  );
}
