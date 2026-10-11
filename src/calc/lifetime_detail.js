// #FR-114 (оператор 2026-10-11, «а где пожизненный расчет?»): строки раздела «Пожизненный расчёт» для «Подробного расчёта» — по секторам обеих диаграмм «Сводки».
// Все числа берутся из тех же объектов, что рисуют «Сводку» (ds = doseSlices, rs = riskSlices, summarySets); отдельного пересчёта нет.
import { fmtNum, fmtDose, fmtPerMillion, nb } from '../ui/fmt.js';
import { fmtShare } from './summary_charts.js';
import { DEFAULT_COEFFS } from '../vendor/radon_risk/radonRisk.mjs';
import { lifeTableName, doseCaption } from '../ui/region_notes.js';
import { normRegion } from './region.js';
import { T, fill, yearsGen, plural, WORDS } from '../ui/texts_v.js';

// «21 год», «22 года», «25 лет» — именительный падеж после числа (#FR-124: не «21 лет»)
const yw = (n) => { if (!Number.isInteger(n)) return 'года'; const k = n % 100, d = n % 10; return k >= 11 && k <= 14 ? 'лет' : d === 1 ? 'год' : d >= 2 && d <= 4 ? 'года' : 'лет'; };

// формула и входные числа сектора диаграммы (а)
function doseFormula(s, ds, ei, cmp) {
  const H = `${fmtNum(ds.H)} ${yw(ds.H)}`, p = ds.parts;
  const msv = (v) => `${fmtNum(v)} мЗв/год`;
  switch (s.id) {
    case 'product': return ['E = Σ E_k по радионуклидам продукта (блок «Итог» выше)', `доза от потребления продукта ${fmtDose(s.doseSv)}`];
    case 'radon': {
      const k = DEFAULT_COEFFS.dose.mSv_per_WLM_dwelling.value, h = DEFAULT_COEFFS.exposure.default_hours_per_year_indoors.value;
      const F = p.radonF ?? DEFAULT_COEFFS.exposure.default_equilibrium_factor_F.value;
      if (!ds.radonFromInput) return ['E = D_год · H, D_год — среднее радона и торона региона', `${msv(p.radon.msv)} × ${H}`];
      return ['E = D_год · H; D_год — модель радона (МКРЗ 137): объёмная активность (ОА) · коэффициент равновесия F · часы в помещении → WLM → мЗв', `ОА ${fmtNum(ei.radonC)} Бк/м³; F = ${fmtNum(F)}; ${fmtNum(h)} ч в год; ${fmtNum(k)} мЗв/WLM; D_год = ${msv(s.doseSv / ds.H * 1e3)}; H = ${H}`];
    }
    case 'med_ct': return ['E = N · d · H', `${fmtNum(ds.medicine.ctN)} в год × ${fmtNum(p.ct.doseProc)} мЗв × ${H}`];
    case 'med_rad': return ['E = N · d · H', `${fmtNum(ds.medicine.radN)} в год × ${fmtNum(p.rad.doseProc)} мЗв × ${H}`];
    case 'med_other': return ['E = D_ост · H; D_ост — среднее медицинское за вычетом КТ и рентгенографии при умолчаниях региона', `${msv(ds.medicine.otherMsv)} (среднее медицинское ${msv(ds.medicine.medMsv)}) × ${H}`];
    case 'flights': { const n = fmtNum(ds.flightN); return ['E = N · d · H', `${n} ${plural(n, WORDS.flight)} в год × ${fmtNum(Number.isFinite(cmp.flightMsv) ? cmp.flightMsv : 0.01)} мЗв × ${H}`]; }
    case 'cosmic': return ['E = D_год · H', `${msv(p.cosmic.msv)} × ${H}`];
    case 'terrestrial':
      if (ds.dwellingFromInput) return ['E = (D_улица + D_жилище) · H; D_жилище = U · часы · k', `на улице ${msv(p.terrOutdoorMsv ?? 0)}; в жилище ${fmtNum(ei.dwellU)} мкЗв/ч × ${fmtNum(cmp.dwell.hours)} ч × ${fmtNum(cmp.dwell.h10ToE)} × ${H}`];
      return ['E = D_год · H', `${msv(p.terrestrial.msv)} × ${H}`];
    case 'techno': return ['E = D_год · H (по разности итога, природной и медицинской доз)', `${msv(p.techno.msv)} × ${H}`];
    case 'internal': return ['E = D_год · H', `${msv(p.ingest.msv)} × ${H}`];
    default: return ['', ''];
  }
}

/** Строки раздела: { dose: { rows, total } | null, risk: { rows, total } | null, captions } */
export function lifetimeDetail(ds, rs, ei, cmp, region, eating = null) {
  const reg = normRegion(region);
  const dose = !ds || !ds.slices.length ? null : {
    rows: ds.slices.map(s => {
      const [formula, inputs] = doseFormula(s, ds, ei, cmp);
      return { id: s.id, label: nb(s.label), formula: nb(formula), inputs: nb(inputs), doseSv: s.doseSv, doseText: fmtDose(s.doseSv), riskText: fmtPerMillion(s.riskP), share: s.share, shareText: fmtShare(s.share), me: s.id === 'product' };
    }),
    total: { doseText: fmtDose(ds.total), riskText: fmtPerMillion(ds.total * ds.riskCoeff), shareText: fmtShare(ds.slices.reduce((a, s) => a + s.share, 0)) }
  };
  const risk = !rs || !rs.slices.length ? null : {
    rows: rs.slices.map(s => ({
      id: s.id, label: nb(s.label), me: s.id === 'product',
      formula: s.id === 'product' ? 'R = r · E(техногенные), блок «Итог» выше' : 'P = вероятность умереть от причины между возрастами a и b: Σ q_x · доля причины по таблице дожития',
      inputs: nb(s.id === 'product' ? `r = ${fmtNum(cmp.riskCoeff)} Зв⁻¹` : `a = ${fmtNum(rs.a)}, b = ${fmtNum(rs.b)} лет`),
      probText: fmtPerMillion(s.p), share: s.share, shareText: fmtShare(s.share)
    })),
    total: { probText: fmtPerMillion(rs.total), shareText: fmtShare(rs.slices.reduce((a, s) => a + s.share, 0)) }
  };
  // #FR-117: строка «питание всю жизнь» — число и формула (режим «с a до b» той же модели)
  const head = eating ? fill(T.EAT_LIFE_HEAD, { H: eating.H, years: yearsGen(eating.H), a: eating.fromAge, b: eating.toAge }) : '';
  const life = !eating ? null : eating.ok
    ? { head, formula: fill(T.EAT_LIFE_FORMULA, { a: eating.fromAge, b: eating.toAge }), inputs: nb(`r = ${fmtNum(cmp.riskCoeff)} Зв⁻¹; E = ${fmtDose(eating.doseTechSvTotal)}`), riskText: fmtPerMillion(eating.riskNominal) }
    : { head, formula: fill(T.EAT_LIFE_UNAVAIL, { reason: eating.reason }), inputs: '', riskText: '' };
  return { H: ds ? ds.H : rs ? rs.H : null, dose, risk, life, captions: { dose: doseCaption(reg), risk: lifeTableName(reg) } };
}
