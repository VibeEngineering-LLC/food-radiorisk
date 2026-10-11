import { summarySets } from '../calc/summary_sets.js';
import { lifetimeDetail } from '../calc/lifetime_detail.js';
import { normRegion } from '../calc/region.js';
import { fmtNum } from '../ui/fmt.js';
import { yearsWord } from '../ui/render.js';

// #FR-114: «Пожизненный расчёт (за H лет)» — по секторам обеих диаграмм «Сводки», числа из тех же срезов (summarySets), порядок и значения те же
const Tbl = ({ kind, head, rows, total, cells }) => <div className="tablewrap"><table className="lt-table"><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
  <tbody>{rows.map(r => <tr key={r.id} data-lt={kind + ':' + r.id} className={r.me ? 'cmp-me' : undefined}>{cells(r).map((c, i) => <td key={i} className={i >= head.length - 2 ? 'num' : undefined}>{c}</td>)}</tr>)}
    <tr data-lt={kind + ':total'}><td><b>Итого</b></td>{total.map((c, i) => <td key={i} className={i >= total.length - 2 ? 'num' : undefined}><b>{c}</b></td>)}</tr></tbody></table></div>;

export default function LifetimeDetail({ result, input, ext }) {
  const { cmp, ei, ds, rs } = summarySets(result, input, ext);
  if (!cmp && !rs) return null;
  const d = lifetimeDetail(ds, rs, ei, cmp, normRegion(input.region), result.eating);
  return <fieldset className="rgroup detail-lifetime"><legend>{`Пожизненный расчёт (за ${fmtNum(d.H)} ${yearsWord(d.H)})`}</legend>
    <p className="hint">Те же секторы и те же числа, что на круговых диаграммах вкладки «Сводка», в том же порядке; горизонт H — от начала потребления до 70 лет возраста (взрослому — 50 лет).</p>
    {d.life && <p className="detail-eating" data-lt="eating:life"><b>{d.life.head}</b>: {d.life.formula}{d.life.inputs ? `; ${d.life.inputs}` : ''}{d.life.riskText ? <> — <b>{d.life.riskText} на 1 000 000</b></> : null}</p>}
    {d.dose && <><h4 className="subhead">{`Диаграмма «доза за ${fmtNum(d.H)} ${yearsWord(d.H)} по источникам» — ${d.captions.dose}`}</h4>
      <Tbl kind="dose" head={['Источник', 'Формула', 'Исходные данные', 'Доза за H лет', 'Риск, r·E (на 1 000 000 человек)', 'Доля, %']} rows={d.dose.rows} total={['', '', d.dose.total.doseText, d.dose.total.riskText, d.dose.total.shareText]} cells={r => [r.label, r.formula, r.inputs, r.doseText, r.riskText, r.shareText]} /></>}
    {d.risk && <><h4 className="subhead">{`Диаграмма «риск смерти по причинам» — ${d.captions.risk}`}</h4>
      <Tbl kind="risk" head={['Причина', 'Формула', 'Исходные данные', 'Вероятность за горизонт (на 1 000 000 человек)', 'Доля, %']} rows={d.risk.rows} total={['', '', d.risk.total.probText, d.risk.total.shareText]} cells={r => [r.label, r.formula, r.inputs, r.probText, r.shareText]} /></>}
    <p className="hint">Риск сектора диаграммы (а) — доза × коэффициент r из блока «Итог»; радон по эпидемиологической модели (Darby и др., 2005) — отдельная величина на вкладке «Бытовые риски» и с дозой не складывается.</p>
  </fieldset>;
}
