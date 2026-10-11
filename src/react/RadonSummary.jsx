import { T, fill } from '../ui/texts_v.js';
import { fmtDose, fmtPerMillion, fmtNum } from '../ui/fmt.js';
import { yearsWord } from '../ui/render.js';

// v57 (оператор): доза и риск радона-222 из воды на «Сводке» — отдельный блок; в главный итог по искусственным нуклидам не входит и с ним не суммируется
export default function RadonSummary({ radon, input }) {
  const span = input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${input.years} ${yearsWord(input.years)}`;
  const rows = [[T.RN_ROW_ING, radon.ingestion], ...(radon.inhalation ? [[T.RN_ROW_INH, radon.inhalation], [T.SUM_RN_ROW_SUM, radon.sum]] : [])];
  return <div className="riskbox rs" id="rnSummary">
    <h3 className="rs-head">{T.RN_TITLE}</h3>
    <div className="tablewrap"><table>
      <thead><tr><th>{T.SUM_RN_COL_PATH}</th><th className="num">Доза за 1 год</th><th className="num">Доза за {span}</th><th className="num">Риск за {span}, на 1 000 000 человек</th></tr></thead>
      <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num">{fmtDose(v.doseSvPerYear)}</td><td className="num">{fmtDose(v.doseSvTotal)}</td><td className="num">{fmtPerMillion(v.riskTotal)}</td></tr>)}</tbody>
    </table></div>
    <p className="hint" id="rnSummaryNote">{fill(T.SUM_RN_NOTE, { r: fmtNum(radon.riskCoeff) })}</p>
    {radon.inhalation && <p className="hint">{T.SUM_RN_INH}</p>}
  </div>;
}
