// #FR-81 V04/V15 (D-022): главный экран результата — блоки A (риск), B (соответствие нормам), C (доза и нормы); все строки приходят готовыми из summaryParts
import { summaryParts } from '../ui/summary_text.js';

// Блок A — сводка по риску
export function RiskSummary({ result, input }) {
  const p = summaryParts(result, input);

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
    <div className="riskbox rs">
      <h3 className="rs-head">{p.head}</h3>
      <div className="rs-number">{p.number}</div>
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
