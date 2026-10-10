// #FR-81 V13 (D-022): вкладка «Подробно (для специалиста)» — справочные величины, не главное число
import { T, fill } from '../ui/texts_v.js';
import { fmtPerMillion, fmtDose2 } from '../ui/fmt.js';
import { KpiGrid } from './Result.jsx';
import OrganRisk from './OrganRisk.jsx';
import Organs from './Organs.jsx';

export default function Reference({ result, input }) {
  const totals = result.totals;

  // Природная доза: общая минус техногенная
  const nat = (totals.doseSvTotal ?? 0) - (totals.techDoseSvTotal ?? 0);

  return (
    <>
      <KpiGrid totals={totals} input={input} />

      <p className="hint">{T.REF_COEFF}</p>

      {totals.naturalNuclides.length > 0 && (
        <p className="hint">
          {fill(T.REF_NATURAL, {
            list: totals.naturalNuclides.join(', '),
            E: fmtDose2(nat),
            k: fmtPerMillion(0.05 * nat),
          })}
        </p>
      )}

      {totals.techDoseSvTotal != null && (
        <>
          <p className="hint">
            {fill(T.REF_DETRIMENT, {
              k57: fmtPerMillion(0.057 * totals.techDoseSvTotal),
              k55: fmtPerMillion(0.055 * totals.techDoseSvTotal),
            })}
          </p>
          <p className="hint">
            {fill(T.REF_NRB23, {
              E_max: fmtDose2(totals.doseMaxYearTech),
              k_max: fmtPerMillion(totals.riskMaxYear),
              label: T.NRB23_LABEL,
            })}
          </p>
          <p className="hint">
            {fill(T.REF_AVG5, {
              E: fmtDose2(totals.doseTechAvg5),
            })}
          </p>
        </>
      )}

      {result.organRisk?.lifetime ? (
        <p className="hint">{T.REF_EPA_LIFETIME}</p>
      ) : result.organRisk ? (
        <p className="hint">
          {fill(T.REF_EPA, {
            m: fmtPerMillion(result.organRisk.totalMortality),
            b: fmtPerMillion(result.organRisk.totalMorbidity),
          })}
        </p>
      ) : null}

      <p className="hint">{T.REF_AGE_TABLE}</p>

      <OrganRisk risk={result.organRisk} input={input} />
      <Organs organs={result.organs} input={input} />
    </>
  );
}
