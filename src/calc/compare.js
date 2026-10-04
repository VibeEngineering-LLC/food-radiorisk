// #FR-73: сравнение дозы от продукта с другими источниками облучения (схема: audit/risk-comparison-design-2026-10-04.md).
// Среди источников облучения сравниваются ДОЗЫ: риск = доза × один и тот же r, коэффициент сокращается (МКРЗ 147, табл. 10; HPA-CRCE-028).

const END_AGE = 70;
const ADULT_HORIZON = 50;
const REP_AGE = { '3m': 0, '1y': 1, '1-2y': 1, '5y': 5, '10y': 10, '12-17y': 12, '15y': 15 };

export function horizonYears(input) {
  if (input.lifetime) return END_AGE - input.lifetime.fromAge;
  if (input.age === 'adult') return ADULT_HORIZON;
  const a = REP_AGE[input.age];
  return Number.isFinite(a) ? END_AGE - a : ADULT_HORIZON;
}

// Возраст начала облучения для модуля радона (взрослый — 18 лет)
export function startAge(input) {
  if (input.lifetime) return input.lifetime.fromAge;
  return input.age === 'adult' ? 18 : (REP_AGE[input.age] ?? 18);
}

// Строка радона: доза за горизонт из модуля радона (МКРЗ 137), риск — тем же r, что у продукта
export function withRadon(cmp, radon, r, label, id = 'radon_home') {
  if (!cmp || !radon || !Number.isFinite(radon.totalDose_mSv)) return cmp;
  const doseSv = radon.totalDose_mSv * 1e-3;
  const row = { id, kind: 'horizon', label, doseSv, source: 'RADON_RISK', loc: null, risk: doseSv * r, shareOfBackground: doseSv / cmp.bgHorizonSv };
  return { ...cmp, rows: [...cmp.rows, row].sort((a, b) => a.doseSv - b.doseSv) };
}

export function buildComparison(records, totals, input) {
  if (!Array.isArray(records) || records.length === 0 || !totals || !Number.isFinite(totals.doseSvPerYear)) return null;
  const rec = (id) => records.find(x => x.id === id && Number.isFinite(x.value));
  const bg = rec('bg_natural_world');
  if (!bg) return null;
  const H = horizonYears(input);
  const r = input.riskCoeffPerSv;
  const bgSvPerYear = bg.value * 1e-3;
  const bgHorizonSv = bgSvPerYear * H;
  const multi = input.years !== 1 || !!input.lifetime;
  const scenarioSv = multi ? totals.doseSvTotal : totals.doseSvPerYear;
  const rows = [{ id: 'product', kind: 'product', label: null, doseSv: scenarioSv, source: null, loc: null }];
  for (const x of records) {
    if (!Number.isFinite(x.value)) continue;
    if (x.kind === 'single') rows.push({ id: x.id, kind: 'single', label: x.label_ru, doseSv: x.value * 1e-3, source: x.source, loc: x.loc });
    else if (x.kind === 'annual') rows.push({ id: x.id, kind: 'horizon', label: x.label_ru, doseSv: x.value * 1e-3 * H, source: x.source, loc: x.loc });
  }
  for (const row of rows) {
    row.risk = row.doseSv * r;
    row.shareOfBackground = row.doseSv / bgHorizonSv;
  }
  rows.sort((a, b) => a.doseSv - b.doseSv);
  const xray = rec('med_chest_xray'), flight = rec('flight_3h');
  const equivalents = { bgDays: scenarioSv / bgSvPerYear * 365, chestXrays: xray ? scenarioSv / (xray.value * 1e-3) : null, flightHours: flight ? scenarioSv / (flight.value * 1e-3) * 3 : null };
  const k = rec('cancer_incidence_coeff'), base = rec('cancer_baseline_ru_0_69');
  const cancer = k && base ? { baseline: base.value, coeffPerSv: k.value, addScenario: scenarioSv * k.value, addBackground: bgHorizonSv * k.value, coeffSource: k.source, coeffLoc: k.loc, baselineSource: base.source, baselineLoc: base.loc } : null;
  return { horizonYears: H, scenarioSv, multi, bgSvPerYear, bgHorizonSv, rows, equivalents, cancer, natural: Array.isArray(totals.naturalNuclides) ? totals.naturalNuclides : [] };
}
