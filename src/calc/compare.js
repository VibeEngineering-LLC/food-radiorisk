// #FR-73: сравнение дозы от продукта с другими источниками облучения (схема: audit/risk-comparison-design-2026-10-04.md).
// Среди источников облучения сравниваются ДОЗЫ: риск = доза × один и тот же r, коэффициент сокращается (МКРЗ 147, табл. 10; HPA-CRCE-028).
// #FR-74: постоянные источники (природный фон, фон в жилище, радон в жилище) идут после разовых, в этом порядке; источники — audit/bg-no-radon-literature-2026-10-04.md.

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

// Строка радона: доза за горизонт из модуля радона (МКРЗ 137), риск — тем же r, что у продукта; ставится в конец
export function withRadon(cmp, radon, r, label, id = 'radon_home') {
  if (!cmp || !radon || !Number.isFinite(radon.totalDose_mSv)) return cmp;
  const doseSv = radon.totalDose_mSv * 1e-3;
  const row = { id, kind: 'horizon', label, doseSv, source: 'RADON_RISK', loc: null };
  return { ...cmp, rows: [...cmp.rows, row] };
}

// Строка «фон в жилище»: показание дозиметра (мкЗв/ч, H*(10)) × часы в помещении × перевод в эффективную дозу (МУК 2.6.1.1088-02) × горизонт; ставится в конец
export function withDwelling(cmp, uSvPerHour, r, label) {
  if (!cmp || !cmp.dwell || !Number.isFinite(uSvPerHour) || uSvPerHour <= 0) return cmp;
  const doseSv = uSvPerHour * 1e-6 * cmp.dwell.hours * cmp.dwell.h10ToE * cmp.horizonYears;
  const row = { id: 'dwelling', kind: 'horizon', label, doseSv, source: cmp.dwell.source, loc: cmp.dwell.loc };
  return { ...cmp, rows: [...cmp.rows, row] };
}

// #FR-78: во сколько раз доза строки больше дозы от продукта: { id: отношение } для всех строк, кроме самого продукта; null, если дозы продукта нет или она 0
export function productRatios(cmp) {
  const p = cmp?.rows?.find(r => r.id === 'product');
  if (!p || !Number.isFinite(p.doseSv) || p.doseSv <= 0) return null;
  const out = {};
  for (const r of cmp.rows) if (r.id !== 'product' && Number.isFinite(r.doseSv)) out[r.id] = r.doseSv / p.doseSv;
  return out;
}

export function buildComparison(records, totals, input, riskCoeff) {
  if (!Array.isArray(records) || records.length === 0 || !totals || !Number.isFinite(totals.doseSvPerYear)) return null;
  const rec = (id) => records.find(x => x.id === id && Number.isFinite(x.value));
  const bg = rec('bg_natural_world');
  if (!bg) return null;
  const H = horizonYears(input);
  const r = riskCoeff; // #FR-81 V01: коэффициент из данных, передаётся вызывающим
  const bgSvPerYear = bg.value * 1e-3;
  const bgHorizonSv = bgSvPerYear * H;
  const multi = input.years !== 1 || !!input.lifetime;
  const scenarioSv = multi ? totals.doseSvTotal : totals.doseSvPerYear;
  const main = [{ id: 'product', kind: 'product', label: null, doseSv: scenarioSv, source: null, loc: null }];
  const steady = [];
  for (const x of records) {
    if (!Number.isFinite(x.value)) continue;
    if (x.kind === 'single') main.push({ id: x.id, kind: 'single', label: x.label_ru, doseSv: x.value * 1e-3, source: x.source, loc: x.loc });
    else if (x.kind === 'annual') steady.push({ id: x.id, kind: 'horizon', label: x.label_ru, doseSv: x.value * 1e-3 * H, source: x.source, loc: x.loc });
  }
  main.sort((a, b) => a.doseSv - b.doseSv);
  const rows = [...main, ...steady];
  const xray = rec('med_chest_xray'), flight = rec('flight_3h');
  // #FR-81 D11: эквиваленты и добавка к риску — за 1 год питания и за весь срок (при сроке больше года)
  const eq = (sv) => ({ bgDays: sv / bgSvPerYear * 365, chestXrays: xray ? sv / (xray.value * 1e-3) : null, flightHours: flight ? sv / (flight.value * 1e-3) * 3 : null });
  const oneYearSv = totals.doseSvPerYear, equivalents = eq(scenarioSv), equivalents1 = multi ? eq(oneYearSv) : null;
  const hrs = rec('dwell_hours'), conv = rec('dwell_h10_to_e');
  const dwell = hrs && conv ? { hours: hrs.value, h10ToE: conv.value, source: conv.source, loc: conv.loc } : null;
  return { riskCoeff: r, horizonYears: H, scenarioSv, multi, bgSvPerYear, bgHorizonSv, rows, equivalents, equivalents1, oneYearSv, dwell, natural: Array.isArray(totals.naturalNuclides) ? totals.naturalNuclides : [] };
}
