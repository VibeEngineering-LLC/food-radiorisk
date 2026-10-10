import { RiskSummary } from './Summary.jsx';
import Pie from './Pie.jsx';
import { radonLungSub, radonSubShares } from '../calc/cancer_sub.js';
import { doseSlices, riskSlices, homeRadonDoseSv, homeDwellingDoseSv, fmtShare, DEFAULT_RADON_C, DEFAULT_DWELL_U, DEFAULT_XRAY_PER_YEAR, DEFAULT_FLIGHT_PER_YEAR } from '../calc/summary_charts.js';
import { fmtNum, fmtDose, fmtPerMillion, esc } from '../ui/fmt.js';
import { yearsWord, sourceFull } from '../ui/render.js';
import { locRu } from '../ui/ru.js';
import { T, fill } from '../ui/texts_v.js';

// короткие названия для таблицы-легенды (полные — в подсказке сектора и в title ячейки)
const SHORT_D = { product: 'Питание', radon: 'Радон', medicine: 'Медицина', flights: 'Перелёты', xray: 'Снимки грудной клетки', cosmic: 'Космос', terrestrial: 'Земля и стройматериалы', internal: 'Пища и вода (внутр.)' };
const SHORT_R = { product: 'Питание', cs_1026: 'Новообразования (C00–D48)', cs_1064: 'Кровообращение (I00–I99)', cs_1096: 'ДТП', cs_1097: 'Падения', cs_1098: 'Утопления', cs_1099: 'Пожар', cs_1100: 'Отравления', cs_1101: 'Самоубийства', cs_1102: 'Убийства', cs_other: 'Прочие причины' };
// Вкладка «Сводка» (#FR-89): общий риск, дозы и две круговые диаграммы на одном пожизненном горизонте
// radonC и dwellU — то же состояние, что поля вкладки «Сравнение с облучением» (поднято в Result.jsx)
export default function SummaryTab({ result, input, radonC, dwellU = NaN, xrayN = DEFAULT_XRAY_PER_YEAR, flightN = DEFAULT_FLIGHT_PER_YEAR }) {
  // Сравнение и срезы для диаграмм
  const cmp = result.comparison;
  const ds = cmp ? doseSlices(cmp, homeRadonDoseSv(input, cmp, radonC), { dwellingSv: homeDwellingDoseSv(cmp, dwellU), radonC, radonIsDefault: radonC === DEFAULT_RADON_C, dwellU, dwellIsDefault: dwellU === DEFAULT_DWELL_U, xrayN, flightN, xrayDefault: xrayN === DEFAULT_XRAY_PER_YEAR, flightDefault: flightN === DEFAULT_FLIGHT_PER_YEAR }) : null;
  const rs = riskSlices(result.lifeRisks);
  const radonSub = rs ? radonLungSub(input, rs.H, radonC) : null; // #FR-95: «в т. ч.» к новообразованиям — сектор цельный (радон и курение перекрываются)
  const cancerP = rs?.slices.find(s => s.id === 'cs_1026')?.p;
  const subSh = radonSub && rs ? radonSubShares(radonSub, cancerP, rs.total) : null; // #FR-97: подсектора внутри сектора новообразований
  const subOk = !!subSh && !subSh.bad;
  const radonOrigin = radonC === DEFAULT_RADON_C ? 'по умолчанию' : 'по вашему вводу';
  // подсектора (сплошной — радон у некурящего; штриховка — добавка у курящего) и такие же строки легенды «в т. ч.»
  const lblNever = radonSub ? fill(T.LIFE_SUB_RADON_NEVER, { C: fmtNum(radonSub.C), origin: radonOrigin }) : '';
  const cancerInner = subOk ? [
    { id: 'radon_never', label: lblNever, share: subSh.never, valueText: fmtPerMillion(radonSub.never), hatch: false },
    { id: 'radon_smoker_add', label: T.LIFE_SUB_RADON_ADD, share: subSh.add, valueText: fmtPerMillion(subSh.addP), hatch: true },
  ] : [];
  const cancerSubs = !radonSub ? [] : subOk
    ? cancerInner.map(u => ({ ...u, short: u.hatch ? T.LIFE_SUB_RADON_ADD_SHORT : T.LIFE_SUB_RADON_NEVER_SHORT, shareText: fmtShare(u.share), sw: true }))
    : [{ id: 'radon', label: fill(T.LIFE_SUB_RADON, { C: fmtNum(radonSub.C), origin: radonOrigin }), short: T.LIFE_SUB_RADON_SHORT, valueText: fill(T.LIFE_SUB_VALUE, { never: fmtPerMillion(radonSub.never), smoker: fmtPerMillion(radonSub.smoker) }) }];
  // строка питания называется явно, с продуктом из формы; длинное название — с многоточием в легенде, полностью в подсказке
  const pname = String(input.product?.name || result.limits?.productName || '').trim();
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const prod = (s) => s.id !== 'product' ? {} : pname
    ? { label: `Питание: ${pname}`, short: `Питание: ${trunc(pname, 24)}`, callout: `Питание (${trunc(pname, 26)})` }
    : { label: 'Питание этим продуктом', short: 'Питание этим продуктом', callout: 'Питание этим продуктом' };

  // Есть ли доля продукта в срезах
  const hasProductDose = !!(ds && ds.slices.some(s => s.id === 'product'));
  const hasProductRisk = !!(rs && rs.slices.some(s => s.id === 'product'));

  // Мелкая доля продукта (< 1%) — показываем пометку
  const tinyDose = hasProductDose && ds.slices.find(s => s.id === 'product').share < 0.01;
  const tinyRisk = hasProductRisk && rs.slices.find(s => s.id === 'product').share < 0.01;
  const showTiny = tinyDose || tinyRisk;

  return (
    <>
      {/* Сводка рисков и блока доз */}
      <RiskSummary result={result} input={input} />
      <p className="hint" id="sumDoses">
        {fill(T.SUM_DOSES, {
          y: fmtDose(result.totals.doseSvPerYear),
          total: input.years > 1 ? fill(T.SUM_DOSES_TOTAL, { span: input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${input.years} ${yearsWord(input.years)}`, t: fmtDose(result.totals.doseSvTotal) }) : '',
        })}
      </p>

      <div className="sum-charts">
        {/* Горизонт расчёта */}
        {ds && ds.slices.length ? (
          <p className="hint" id="sumHorizon">
            {fill(T.SUM_HORIZON, { H: fmtNum(ds.H), years: yearsWord(ds.H) })}
          </p>
        ) : null}

        {/* Диаграмма A: дозы */}
        {ds && ds.slices.length ? (
          <>
            <Pie
              id="dose"
              title={T.SUM_CHART_A_TITLE}
              valueHead="Доза; риск (на 1 млн)"
              slices={ds.slices.map(s => ({
                id: s.id,
                ci: s.ci,
                label: s.label,
                short: SHORT_D[s.id],
                ...prod(s),
                share: s.share,
                me: s.id === 'product',
                valueText: `${fmtDose(s.doseSv)}; ${fmtPerMillion(s.riskP)}`,
              }))}
            />
            <p className="hint">
              {fill(T.SUM_CHART_A_NOTE, {
                H: fmtNum(ds.H),
                years: yearsWord(ds.H),
                r: fmtNum(ds.riskCoeff),
                radon: ds.radonFromInput ? fill(T.SUM_RADON_INPUT, { C: fmtNum(radonC), origin: ds.radonIsDefault ? T.SUM_RADON_ORIGIN_DEFAULT : T.SUM_RADON_ORIGIN_INPUT }) : T.SUM_RADON_WORLD,
                rest: ds.dwellingFromInput ? fill(T.SUM_REST_DWELL, { indoor: fmtNum(ds.parts.terrIndoor.msv), U: fmtNum(dwellU), origin: ds.dwellingIsDefault ? T.SUM_RADON_ORIGIN_DEFAULT : T.SUM_RADON_ORIGIN_INPUT, h: fmtNum(cmp.dwell.hours) }) : fill(T.SUM_REST_WORLD, { sum: fmtNum(ds.naturalSumMsv, 4), tot: fmtNum(ds.naturalTotalMsv), gap: fmtNum(Math.abs(ds.naturalGapMsv), 2) }),
              })}
            </p>
            {ds.slices.some(s => s.id === 'medicine') ? <p className="hint" id="sumMedNote">{T.SUM_MED_NOTE}</p> : null}
            <p className="hint" id="sumRadonSrc">
              {fill(T.SUM_RADON_SRC, { r1: fmtNum(ds.worldRadon.radonSvPerYear * 1e3), r2: fmtNum(ds.worldRadon.thoronSvPerYear * 1e3), src: '' })}
              <span dangerouslySetInnerHTML={{ __html: sourceFull(ds.worldRadon.source) + (locRu(ds.worldRadon.loc) ? ', ' + esc(locRu(ds.worldRadon.loc)) : '') }} />.
            </p>
            {cmp.natural && cmp.natural.length ? (
              <p className="hint">{fill(T.SUM_NATURAL_IN_A, { list: cmp.natural.join(', ') })}</p>
            ) : null}
          </>
        ) : (
          <p className="hint" id="sumNoChartA">{cmp ? T.SUM_NO_CHART_DATA : T.SUM_NO_CHART}</p>
        )}

        {/* Диаграмма B: риски */}
        {rs && rs.slices.length ? (
          <>
            <Pie
              id="risk"
              title={T.SUM_CHART_B_TITLE}
              valueHead="Риск смерти (на 1 млн)"
              labelHead="Причина"
              slices={rs.slices.map(s => ({
                id: s.id,
                ci: s.ci,
                label: s.label,
                short: SHORT_R[s.id],
                ...prod(s),
                share: s.share,
                me: s.id === 'product',
                valueText: fmtPerMillion(s.p),
                subs: s.id === 'cs_1026' ? cancerSubs : [],
                inner: s.id === 'cs_1026' && subOk ? cancerInner : undefined,
              }))}
            />
            <p className="hint">
              {fill(T.SUM_CHART_B_NOTE, { a: fmtNum(rs.a), b: fmtNum(rs.b) })}
              {rs.capped ? ` ${T.SUM_CHART_B_CAPPED}` : ''} {T.SUM_UNIT}
            </p>
            {subSh && subSh.bad ? <p className="msg warn" id="sumSubBad">{T.LIFE_SUB_BAD}</p> : null}
            {subOk ? <p className="hint" id="sumSubSmoke">{T.LIFE_SUB_SMOKE_NOTE}</p> : null}
            <p className="hint" id="sumSubNote">{fill(T.LIFE_SUB_NOTE, { H: rs.H, years: yearsWord(rs.H) })}</p>
            {!hasProductRisk ? <p className="hint">{T.SUM_CHART_B_NO_PRODUCT}</p> : null}
          </>
        ) : (
          <p className="hint">{T.SUM_NO_CHART}</p>
        )}

        {/* Пометка о малой доле продукта */}
        {showTiny ? <p className="hint">{T.SUM_TINY}</p> : null}
      </div>
    </>
  );
}
