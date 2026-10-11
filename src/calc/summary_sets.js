// #FR-114: общий источник срезов «Сводки» — вкладка «Сводка» и «Подробный расчёт» берут одни и те же объекты (отдельного пересчёта нет)
import { doseSlices, riskSlices, homeRadonDoseSv, homeDwellingDoseSv } from './summary_charts.js';
import { effectiveInputs } from './ext_inputs.js';

/** ext — { radonC, dwellU, ctN, xrayN, flightN } как в SummaryTab; возвращает { cmp, ei, ds, rs } */
export function summarySets(result, input, ext = {}) {
  const cmp = result.comparison;
  const ei = cmp ? effectiveInputs(cmp.parts, ext) : null;
  const ds = cmp ? doseSlices(cmp, homeRadonDoseSv(input, cmp, ei.radonC), { dwellingSv: ei.dwellU != null ? homeDwellingDoseSv(cmp, ei.dwellU) : null, radonC: ei.radonC, radonIsDefault: ei.radonIsDefault, dwellU: ei.dwellU, ctN: ei.ctIsDefault ? null : ei.ctN, xrayN: ei.xrayIsDefault ? null : ei.xrayN, flightN: ei.flightN, flightDefault: ei.flightIsDefault }) : null;
  return { cmp, ei, ds, rs: riskSlices(result.lifeRisks) };
}
