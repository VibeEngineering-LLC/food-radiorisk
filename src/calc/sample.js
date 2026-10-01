// src/calc/sample.js

export const KBQ_PER_M2_PER_CI_PER_KM2 = 37; // 1 Ci/km2 = 37 kBq/m2

function need(fn, name, v, pred, what) {
  if (typeof v !== "number" || !Number.isFinite(v) || !pred(v)) {
    throw new RangeError(`${fn}: ${name} ${what} (got ${v})`);
  }
}

/**
 * @param {number} measuredBqPerKg - Activity of the counting sample [Bq/kg]
 * @param {number} concentrationFactor - Concentration factor K (dimensionless)
 * @returns {number} Activity of the product [Bq/kg]
 */
export function productFromSample(measuredBqPerKg, concentrationFactor) {
  need("productFromSample", "measuredBqPerKg", measuredBqPerKg, v => v >= 0, "must be finite >= 0");
  need("productFromSample", "concentrationFactor", concentrationFactor, v => v > 0, "must be finite > 0");
  return measuredBqPerKg / concentrationFactor;
}

/**
 * @param {number} dryMatterPercent - Dry matter content [%]
 * @returns {number} Concentration factor K (dimensionless)
 */
export function concentrationFactorFromDryMatter(dryMatterPercent) {
  need("concentrationFactorFromDryMatter", "dryMatterPercent", dryMatterPercent, v => v > 0 && v <= 100, "must be finite > 0 and <= 100");
  return 100 / dryMatterPercent;
}

/**
 * @param {number} activityBqPerKg - Activity [Bq/kg]
 * @param {"fresh"|"dried"} productState - State of the product
 * @param {"fresh"|"dry"|null} transferBasis - Basis of the transfer coefficient
 * @param {number|null} dryMatterPercent - Dry matter content [%], required if conversion needed
 * @returns {number} Activity on the mass basis of the transfer coefficient [Bq/kg]
 */
export function toTransferBasis(activityBqPerKg, productState, transferBasis, dryMatterPercent, dryingFactor = null) {
  need("toTransferBasis", "activityBqPerKg", activityBqPerKg, v => v >= 0, "must be finite >= 0");
  if (productState !== "fresh" && productState !== "dried") {
    throw new RangeError(`toTransferBasis: productState must be "fresh" or "dried" (got ${productState})`);
  }
  if (transferBasis !== "fresh" && transferBasis !== "dry") {
    throw new RangeError(`toTransferBasis: transferBasis must be "fresh" or "dry" (got ${transferBasis})`);
  }
  // #FR-33/#FR-34: всегда через исходный (свежий) продукт. Сушёный ≠ абсолютно сухой: сушёный → свежий делением
  // на коэффициент усушки (по нормативу 800/160 = 5 для ягод), свежий → сухая масса — через % сухого вещества
  let fresh = activityBqPerKg;
  if (productState === "dried") {
    need("toTransferBasis", "dryingFactor", dryingFactor, v => v >= 1, "must be finite >= 1");
    fresh = activityBqPerKg / dryingFactor;
  }
  if (transferBasis === "fresh") return fresh;
  need("toTransferBasis", "dryMatterPercent", dryMatterPercent, v => v > 0 && v <= 100, "must be finite > 0 and <= 100");
  return fresh * 100 / dryMatterPercent;
}

/**
 * @param {number} activityBqPerKg - Activity of the product [Bq/kg]
 * @param {number} coeffM2PerKg - Transfer coefficient [m2/kg]
 * @returns {number} Estimated ground deposition [kBq/m2]
 */
export function depositionFromProduct(activityBqPerKg, coeffM2PerKg) {
  need("depositionFromProduct", "activityBqPerKg", activityBqPerKg, v => v >= 0, "must be finite >= 0");
  need("depositionFromProduct", "coeffM2PerKg", coeffM2PerKg, v => v > 0, "must be finite > 0");
  return activityBqPerKg / (1000 * coeffM2PerKg);
}

/**
 * @param {number} activityBqPerKg - Activity of the product [Bq/kg]
 * @param {{central: number|null, min: number|null, max: number|null}} coeffs - Transfer coefficients [m2/kg]
 * @returns {{central: number|null, min: number|null, max: number|null, unbounded: boolean}} Estimated deposition range [kBq/m2]
 */
export function depositionRange(activityBqPerKg, coeffs) {
  need("depositionRange", "activityBqPerKg", activityBqPerKg, v => v >= 0, "must be finite >= 0");

  const calc = (c) => (typeof c === "number" && Number.isFinite(c) && c > 0) ? depositionFromProduct(activityBqPerKg, c) : null;

  const central = calc(coeffs.central);
  // min deposition corresponds to max coefficient
  const min = calc(coeffs.max);
  // max deposition corresponds to min coefficient
  const max = (typeof coeffs.min === "number" && Number.isFinite(coeffs.min) && coeffs.min > 0) ? calc(coeffs.min) : null;

  const unbounded = typeof coeffs.min === "number" && Number.isFinite(coeffs.min) && coeffs.min === 0;

  return { central, min, max: unbounded ? null : max, unbounded };
}

/**
 * @param {number|null} kBqPerM2 - Ground deposition [kBq/m2]
 * @returns {number|null} Ground deposition [Ci/km2]
 */
export function toCiPerKm2(kBqPerM2) {
  if (kBqPerM2 === null) return null;
  need("toCiPerKm2", "kBqPerM2", kBqPerM2, v => v >= 0, "must be finite >= 0");
  return kBqPerM2 / KBQ_PER_M2_PER_CI_PER_KM2;
}

/**
 * #FR-45: диапазон плотности загрязнения всегда: нижняя граница — меньшая плотность (большой КП) при A·(1−rel),
 * верхняя — большая плотность (малый КП) при A·(1+rel). Одна точка КП даёт диапазон только от погрешности A.
 * @param {{central: number|null, min: number|null, max: number|null, unbounded: boolean}} kBq - Deposition [kBq/m2]
 * @param {number} rel - Relative uncertainty of A (u/A), >= 0
 * @returns {{kBqPerM2: {lo: number|null, hi: number|null}, ciPerKm2: {lo: number|null, hi: number|null}}}
 */
export function depositionBounds(kBq, rel) {
  need("depositionBounds", "rel", rel, v => v >= 0, "must be finite >= 0");
  const pick = (...v) => v.find(x => typeof x === "number" && Number.isFinite(x)) ?? null;
  const base = { lo: pick(kBq.min, kBq.central, kBq.max), hi: kBq.unbounded ? null : pick(kBq.max, kBq.central, kBq.min) };
  const lo = base.lo === null ? null : base.lo * Math.max(0, 1 - rel);
  const hi = base.hi === null ? null : base.hi * (1 + rel);
  return { kBqPerM2: { lo, hi }, ciPerKm2: { lo: toCiPerKm2(lo), hi: toCiPerKm2(hi) } };
}

/**
 * @param {number} activityBqPerKg - Activity of the product [Bq/kg]
 * @param {{id: string, quantity: string, unit_norm: string, unit_factor: number|null, am: number|null, gm: number|null, min: number|null, max: number|null, mass_basis: "fresh"|"dry"|null}} rec - Transfer record
 * @param {"fresh"|"dried"} productState - State of the product
 * @param {number|null} dryMatterPercent - Dry matter content [%]
 * @returns {{transferId: string, basis: "fresh"|"dry"|null, activityOnBasis: number, coeffM2PerKg: {central: number|null, min: number|null, max: number|null}, kBqPerM2: {central: number|null, min: number|null, max: number|null, unbounded: boolean}, ciPerKm2: {central: number|null, min: number|null, max: number|null}}}
 */
export function depositionEstimate(activityBqPerKg, rec, productState, dryMatterPercent, dryingFactor = null) {
  need("depositionEstimate", "activityBqPerKg", activityBqPerKg, v => v >= 0, "must be finite >= 0");

  if (rec.unit_norm !== "m2/kg" || typeof rec.unit_factor !== "number" || !Number.isFinite(rec.unit_factor) || rec.unit_factor <= 0) {
    throw new RangeError(`depositionEstimate: coefficient unit not established (${rec.id})`);
  }

  const mul = (v) => (typeof v === "number" && Number.isFinite(v)) ? v * rec.unit_factor : null;

  const centralVal = typeof rec.am === "number" && Number.isFinite(rec.am) ? rec.am : (typeof rec.gm === "number" && Number.isFinite(rec.gm) ? rec.gm : null);
  const central = mul(centralVal);
  const min = mul(rec.min);
  const max = mul(rec.max);

  if (central === null && min === null && max === null) {
    throw new RangeError(`depositionEstimate: no coefficient value (${rec.id})`);
  }

  const a = toTransferBasis(activityBqPerKg, productState, rec.mass_basis ?? null, dryMatterPercent, dryingFactor);
  const kBqPerM2 = depositionRange(a, { central, min, max });

  return {
    transferId: rec.id,
    basis: rec.mass_basis ?? null,
    activityOnBasis: a,
    coeffM2PerKg: { central, min, max },
    kBqPerM2,
    ciPerKm2: {
      central: toCiPerKm2(kBqPerM2.central),
      min: toCiPerKm2(kBqPerM2.min),
      max: toCiPerKm2(kBqPerM2.max)
    }
  };
}
