import { RiskSummary } from './Summary.jsx';
import Pie from './Pie.jsx';
import { radonLungSub, radonSubShares } from '../calc/cancer_sub.js';
import { doseSlices, riskSlices, homeRadonDoseSv, homeDwellingDoseSv, fmtShare, DEFAULT_FLIGHT_PER_YEAR } from '../calc/summary_charts.js';
import { summarySets } from '../calc/summary_sets.js';
import { DEFAULT_COEFFS } from '../vendor/radon_risk/radonRisk.mjs';
import { normRegion } from '../calc/region.js';
import { regionName, doseCaption, riskCaption, lifeTableName, ctNote } from '../ui/region_notes.js';
import RegionSwitch from './RegionSwitch.jsx';
import { fmtNum, fmtDose, fmtPerMillion, esc, nb } from '../ui/fmt.js';
import { yearsWord, sourceFull } from '../ui/render.js';
import { locRu } from '../ui/ru.js';
import { T, fill, timesVars } from '../ui/texts_v.js';

// #FR-100 v39: легенда показывает полные однозначные названия (без сокращений «внутр.», «ОА»); пояснения и коды МКБ — в подсказке (hint)
// Вкладка «Сводка» (#FR-89): общий риск, дозы и две круговые диаграммы на одном пожизненном горизонте
// radonC и dwellU — то же состояние, что поля вкладки «Сравнение с облучением» (поднято в Result.jsx)
export default function SummaryTab({ result, input, radonC = NaN, dwellU = NaN, ctN = NaN, xrayN = NaN, flightN = DEFAULT_FLIGHT_PER_YEAR, onRegion }) {
  // Сравнение и срезы для диаграмм; #FR-101: умолчания полей — по региону (введённое пользователем сохраняется при смене региона)
  const region = normRegion(input.region);
  const { cmp, ei, ds, rs } = summarySets(result, input, { radonC, dwellU, ctN, xrayN, flightN }); // #FR-114: те же срезы получает «Подробный расчёт»
  const radonCEff = ei ? ei.radonC : radonC;
  const radonSub = rs && Number.isFinite(radonCEff) ? radonLungSub(input, rs.H, radonCEff, rs.b) : null; // #FR-99 (Б-2): подсектор — радон у НЕкурящего на горизонте круга (до возраста b)
  const cancerP = rs?.slices.find(s => s.id === 'cs_1026')?.p;
  const lungP = result.lifeRisks?.lifetime?.refs?.find(r => r.code === '1034')?.p; // смерти от рака лёгкого за тот же горизонт — верхняя граница подсектора
  const subSh = radonSub && rs ? radonSubShares(radonSub, Number.isFinite(lungP) ? lungP : cancerP, rs.total) : null;
  const subOk = !!subSh && !subSh.bad;
  const adultStart = radonSub && radonSub.s >= 18; // курящему ребёнку строка не показывается
  const radonOrigin = !ei || ei.radonIsDefault ? 'по умолчанию' : 'введено пользователем';
  // подсектор (сплошной) и строка легенды «в т. ч.»; курящий — не сектор круга, а строка текста под диаграммой
  const lblNever = radonSub ? fill(T.LIFE_SUB_RADON, { C: fmtNum(radonSub.C), origin: radonOrigin }) : '';
  const cancerInner = subOk ? [{ id: 'radon_never', label: lblNever, share: subSh.never, valueText: fmtPerMillion(radonSub.neverB), hatch: false }] : [];
  const cancerSubs = !radonSub || !subOk ? [] : cancerInner.map(u => ({ ...u, short: T.LIFE_SUB_RADON_NEVER_SHORT, shareText: fmtShare(u.share), sw: true }));
  // #FR-98: подсектора «от загрязнения воздуха» (набор «Россия», точки) внутри причин; рядом с подсектором радона, не поверх; превышение родителя — не рисуем и предупреждаем
  const air = result.lifeRisks?.lifetime?.air;
  const airFor = (parentId) => {
    const g = air?.groups.find(x => x.parent === parentId), parent = rs?.slices.find(x => x.id === parentId);
    if (!g || !parent) return { inner: [], subs: [], bad: false };
    const radonP = parentId === 'cs_1026' && subOk ? radonSub.neverB : 0;
    if (!(g.p >= 0) || g.p + radonP > parent.p) return { inner: [], subs: [], bad: true };
    const u = { id: g.id, label: g.label, hint: g.hint, share: g.p / rs.total, valueText: fmtPerMillion(g.p), dots: true, ci: parent.ci };
    return { inner: [u], subs: [{ ...u, short: g.label, shareText: fmtShare(u.share), sw: true }], bad: false };
  };
  const airBad = !!air && rs && air.groups.some(g => airFor(g.parent).bad);
  // строка питания называется явно, с продуктом из формы; длинное название — с многоточием в легенде, полностью в подсказке
  const pname = String(input.product?.name || result.limits?.productName || '').trim();
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const nucl = (result.rows || []).filter(r => r.nuclide !== 'Rn-222').map(r => r.nuclide).join(', '); // v54: радон-222 в сектор продукта не входит
  const prod = (s, kind) => s.id !== 'product' ? {} : pname
    ? (() => { const label = kind === 'risk' ? `Этот продукт: ${pname} — радиационно-индуцированный рак` : `Этот продукт: ${pname}${nucl ? ` (${nucl})` : ''} — по расчёту`; return { label, short: pname.length <= 24 ? label : `Этот продукт: ${trunc(pname, 24)}`, callout: `Этот продукт (${trunc(pname, 26)})` }; })()
    : { label: kind === 'risk' ? 'Этот продукт — радиационно-индуцированный рак' : 'Этот продукт — по расчёту', short: 'Этот продукт', callout: 'Этот продукт' };

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
      {result.totals.doseSvPerYear != null && <p className="hint" id="sumDoses">
        {fill(T.SUM_DOSES, {
          y: fmtDose(result.totals.doseSvPerYear),
          total: input.years > 1 ? fill(T.SUM_DOSES_TOTAL, { span: input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${input.years} ${yearsWord(input.years)}`, t: fmtDose(result.totals.doseSvTotal) }) : '',
        })}
      </p>}

      <div className="sum-charts">
        {/* #FR-101: переключатель региона данных — над диаграммами; одна настройка на всё приложение */}
        <RegionSwitch region={region} onRegion={onRegion} />
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
              title={fill(T.SUM_CHART_A_TITLE, { H: fmtNum(ds.H), years: yearsWord(ds.H) }) + ' — ' + doseCaption(region)}
              valueHead="Доза; риск (на 1 000 000 человек)"
              slices={ds.slices.map(s => ({
                id: s.id,
                ci: s.ci,
                label: s.label,
                hint: s.hint,
                ...prod(s, 'dose'),
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
                radon: ds.radonFromInput ? fill(T.SUM_RADON_INPUT, { C: fmtNum(ei.radonC), origin: ds.radonIsDefault ? T.SUM_RADON_ORIGIN_DEFAULT : T.SUM_RADON_ORIGIN_INPUT }) : fill(T.SUM_RADON_WORLD, { region: regionName(region) }),
                rest: ds.dwellingFromInput ? fill(T.SUM_REST_DWELL, { indoor: fmtNum(ds.parts.terrestrial.msv), out: fmtNum(ds.parts.terrOutdoorMsv ?? 0), U: fmtNum(ei.dwellU), origin: T.SUM_RADON_ORIGIN_INPUT, h: fmtNum(cmp.dwell.hours) }) : fill(Math.abs(ds.naturalGapMsv) < 1e-9 ? T.SUM_REST_WORLD_EQ : T.SUM_REST_WORLD, { region: regionName(region), cap: doseCaption(region), sum: fmtNum(ds.naturalSumMsv, 4), tot: fmtNum(ds.naturalTotalMsv), gap: fmtNum(Math.abs(ds.naturalGapMsv), 2) }),
              })}
            </p>
            {!ds.parts.techno ? <p className="hint" id="sumTechnoNone">{T.SUM_TECHNO_NONE}</p> : null}
            {ds.medicineBad ?<p className="msg warn" id="sumMedBad">{T.SUM_MED_BAD}</p> : null}
            {ds.radonFromInput ? <p className="hint" id="sumRadonDiff">{fill(T.SUM_RADON_DIFF, { k: fmtNum(DEFAULT_COEFFS.dose.mSv_per_WLM_dwelling.value), h: fmtNum(DEFAULT_COEFFS.exposure.default_hours_per_year_indoors.value), F: fmtNum(ds.parts.radonF ?? DEFAULT_COEFFS.exposure.default_equilibrium_factor_F.value), a: fmtNum(ds.slices.find(s => s.id === 'radon').doseSv / ds.H * 1e3), r: fmtNum(ds.radonBgMsvPerYear) })}</p> : null}
            {ds.medicine && !ds.medicineBad ? <p className="hint" id="sumMedNote">{fill(T.SUM_MED_NOTE, { region: regionName(region), med: fmtNum(ds.parts.medicine.msv), ctNote: ctNote(ds.parts) })}</p> : null}
            <p className="hint" id="sumRadonSrc">
              {fill(T.SUM_RADON_SRC, { r: fmtNum(ds.radonBgMsvPerYear), region: regionName(region), src: '' })}
              <span dangerouslySetInnerHTML={{ __html: nb(sourceFull(ds.parts.radon.source) + (locRu(ds.parts.radon.loc) ? ', ' + esc(locRu(ds.parts.radon.loc)) : '')) }} />.
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
              title={fill(T.SUM_CHART_B_TITLE, { a: fmtNum(rs.a), b: fmtNum(rs.b) }) + ' — ' + riskCaption(region)}
              valueHead="Риск смерти (на 1 000 000 человек)"
              labelHead="Причина"
              slices={rs.slices.map(s => ({
                id: s.id,
                ci: s.ci,
                label: s.label,
                hint: s.hint,
                ...prod(s, 'risk'),
                share: s.share,
                me: s.id === 'product',
                valueText: fmtPerMillion(s.p),
                subs: [...(s.id === 'cs_1026' ? cancerSubs : []), ...airFor(s.id).subs],
                inner: [...(s.id === 'cs_1026' && subOk ? cancerInner : []), ...airFor(s.id).inner],
              }))}
            />
            <p className="hint">
              {fill(T.SUM_CHART_B_NOTE, { a: fmtNum(rs.a), b: fmtNum(rs.b), tab: lifeTableName(region) })}
              {rs.capped ? ` ${T.SUM_CHART_B_CAPPED}` : ''}
            </p>
            {airBad ? <p className="msg warn" id="sumAirBad">{T.LIFE_AIR_BAD}</p> : null}
            {air && !airBad ? <p className="hint" id="sumAirNote">{fill(T.LIFE_AIR_NOTE, { year: air.year, a: fmtNum(rs.a), b: fmtNum(rs.b) })}</p> : null}
            {subSh && subSh.bad ? <p className="msg warn" id="sumSubBad">{T.LIFE_SUB_BAD}</p> : null}
            {subOk && adultStart && Number.isFinite(radonSub.ratio) ? <p className="hint" id="sumSubSmoke">{fill(T.LIFE_SUB_SMOKE_NOTE, timesVars(fmtNum(Math.round(radonSub.ratio))))}</p> : null}
            <p className="hint" id="sumSubNote">{fill(T.LIFE_SUB_NOTE, { H: rs.H, years: yearsWord(rs.H), b: fmtNum(rs.b), overlap: air ? 'радона, курения и загрязнения воздуха' : 'радона и курения' })}</p>
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
