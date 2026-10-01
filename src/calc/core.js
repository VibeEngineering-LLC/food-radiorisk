/**
 * Calculation core for radionuclide dose and risk estimation.
 * Units: Bq, kg, Sv, kBq/m2, days.
 * Sources: IAEA TRS-472 (sect. 11, eq. 51), МУК 2.6.1.1194-03 (п. 6.1–6.5), ICRP 103 (LNT).
 */

const VERDICT = Object.freeze({
  CONFORMS: "conforms",
  NONCONFORMS: "nonconforms",
  UNDETERMINED: "undetermined"
});

function need(fn, name, v, pred, what) {
  if (!Number.isFinite(v) || !pred(v)) {
    throw new RangeError(`${fn}: ${name} ${what}`);
  }
}

/**
 * Calculates total intake activity.
 * @param {number} activityBqPerKg - Specific activity in Bq/kg.
 * @param {number} massKg - Mass of product in kg.
 * @param {number} fr - Fraction remaining (0-1).
 * @returns {number} Total activity in Bq.
 */
export function intakeBq(activityBqPerKg, massKg, fr = 1) {
  need("intakeBq", "activityBqPerKg", activityBqPerKg, v => v >= 0, "must be >= 0");
  need("intakeBq", "massKg", massKg, v => v >= 0, "must be >= 0");
  need("intakeBq", "fr", fr, v => v >= 0 && v <= 1, "must be between 0 and 1");
  return activityBqPerKg * massKg * fr;
}

/**
 * Calculates processing factor Pf from Fr and Pe: Pf = Fr / Pe (IAEA TRS-472, sect. 11, eq. 51).
 * Pf — отношение удельных активностей продукта после и до обработки; «кратность снижения» русских источников = 1/Pf.
 * @param {number} fr - Food processing retention factor Fr: доля активности сырья, оставшаяся в продукте (0-1).
 * @param {number} pe - Processing efficiency Pe: масса продукта после обработки / масса сырья (>0; может быть > 1).
 * @returns {number} Dimensionless processing factor.
 */
export function pfFromFrPe(fr, pe) {
  need("pfFromFrPe", "fr", fr, v => v >= 0 && v <= 1, "must be between 0 and 1");
  need("pfFromFrPe", "pe", pe, v => v > 0, "must be > 0");
  return fr / pe;
}

/**
 * Calculates activity in cooked dish.
 * @param {number} activityRawBqPerKg - Raw specific activity in Bq/kg.
 * @param {number} pf - Processing factor (dimensionless).
 * @returns {number} Activity in Bq/kg.
 */
export function dishActivity(activityRawBqPerKg, pf) {
  need("dishActivity", "activityRawBqPerKg", activityRawBqPerKg, v => v >= 0, "must be >= 0");
  need("dishActivity", "pf", pf, v => v >= 0, "must be >= 0");
  return activityRawBqPerKg * pf;
}

/**
 * Calculates committed effective dose.
 * @param {number} intakeBqValue - Intake in Bq.
 * @param {number} eSvPerBq - Dose coefficient in Sv/Bq.
 * @returns {number} Dose in Sv.
 */
export function committedDoseSv(intakeBqValue, eSvPerBq) {
  need("committedDoseSv", "intakeBqValue", intakeBqValue, v => v >= 0, "must be >= 0");
  need("committedDoseSv", "eSvPerBq", eSvPerBq, v => v > 0 && v < 1e-3, "must be between 0 and 1e-3");
  return intakeBqValue * eSvPerBq;
}

/**
 * Calculates annual intake.
 * @param {object} params - Input parameters.
 * @param {number} params.activityBqPerKg - Specific activity in Bq/kg.
 * @param {number} params.portionKg - Portion mass in kg.
 * @param {number} params.portionsPerYear - Number of portions per year.
 * @param {number} [params.fr=1] - Fraction remaining.
 * @returns {number} Annual intake in Bq/year.
 */
export function annualIntakeBq({ activityBqPerKg, portionKg, portionsPerYear, fr = 1 }) {
  need("annualIntakeBq", "portionsPerYear", portionsPerYear, v => v >= 0, "must be >= 0");
  return intakeBq(activityBqPerKg, portionKg * portionsPerYear, fr);
}

/**
 * Calculates cancer risk from dose.
 * @param {number} doseSv - Dose in Sv.
 * @param {number} riskCoeffPerSv - Risk coefficient per Sv.
 * @returns {number} Dimensionless probability.
 */
export function riskFromDose(doseSv, riskCoeffPerSv) {
  need("riskFromDose", "doseSv", doseSv, v => v >= 0, "must be >= 0");
  need("riskFromDose", "riskCoeffPerSv", riskCoeffPerSv, v => v > 0 && v < 1, "must be between 0 and 1");
  return doseSv * riskCoeffPerSv;
}

/**
 * Calculates annual limit on intake (ПГП, предел годового поступления): ПГП = dose limit / e (НРБ-99/2009 Прил. 2).
 * @param {number} doseLimitSv - Dose limit in Sv.
 * @param {number} eSvPerBq - Dose coefficient in Sv/Bq.
 * @returns {number} Annual intake limit in Bq/year.
 */
export function pgpFromDose(doseLimitSv, eSvPerBq) {
  need("pgpFromDose", "doseLimitSv", doseLimitSv, v => v > 0, "must be > 0");
  need("pgpFromDose", "eSvPerBq", eSvPerBq, v => v > 0 && v < 1e-3, "must be between 0 and 1e-3");
  return doseLimitSv / eSvPerBq;
}

/**
 * Calculates maximum mass allowed.
 * @param {number} annualLimitBq - Annual limit in Bq.
 * @param {number} activityBqPerKg - Specific activity in Bq/kg.
 * @param {number} fr - Fraction remaining (0-1).
 * @returns {number} Mass in kg/year.
 */
export function maxMassKg(annualLimitBq, activityBqPerKg, fr = 1) {
  need("maxMassKg", "annualLimitBq", annualLimitBq, v => v > 0, "must be > 0");
  need("maxMassKg", "activityBqPerKg", activityBqPerKg, v => v >= 0, "must be >= 0");
  need("maxMassKg", "fr", fr, v => v >= 0 && v <= 1, "must be between 0 and 1");
  const denom = activityBqPerKg * fr;
  return denom === 0 ? Infinity : annualLimitBq / denom;
}

/**
 * Checks compliance with permissible levels (MUK 2.6.1.1194-03).
 * @param {Array<{a: number, da: number, h: number}>} items - Array of measurements.
 * @returns {{B: number, dB: number, verdict: string, precisionOk: boolean}} Result object.
 */
export function complianceB(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new RangeError("complianceB: items must be a non-empty array");
  }
  let B = 0;
  let dBSumSq = 0;
  for (const item of items) {
    need("complianceB", "a", item.a, v => v >= 0, "must be >= 0");
    need("complianceB", "da", item.da, v => v >= 0, "must be >= 0");
    need("complianceB", "h", item.h, v => v > 0, "must be > 0");
    B += item.a / item.h;
    dBSumSq += Math.pow(item.da / item.h, 2);
  }
  const dB = Math.sqrt(dBSumSq);
  let verdict;
  if (B + dB <= 1) {
    verdict = VERDICT.CONFORMS;
  } else if (B - dB > 1) {
    verdict = VERDICT.NONCONFORMS;
  } else {
    verdict = VERDICT.UNDETERMINED;
  }
  return { B, dB, verdict, precisionOk: dB <= 0.3 };
}

/**
 * Calculates decay factor.
 * @param {number} halfLife - Half-life in time units.
 * @param {number} elapsed - Elapsed time in same units.
 * @returns {number} Dimensionless decay factor.
 */
export function decayFactor(halfLife, elapsed) {
  need("decayFactor", "halfLife", halfLife, v => v > 0, "must be > 0");
  need("decayFactor", "elapsed", elapsed, () => true, "must be a finite number");
  return Math.pow(2, -elapsed / halfLife);
}

/**
 * Corrects activity for decay between dates.
 * @param {number} activity - Initial activity in Bq.
 * @param {number} halfLifeDays - Half-life in days.
 * @param {Date} fromDate - Start date.
 * @param {Date} toDate - End date.
 * @returns {number} Corrected activity in Bq.
 */
export function decayCorrect(activity, halfLifeDays, fromDate, toDate) {
  need("decayCorrect", "activity", activity, v => v >= 0, "must be >= 0");
  if (!(fromDate instanceof Date) || isNaN(fromDate.getTime())) {
    throw new RangeError("decayCorrect: fromDate must be a valid Date");
  }
  if (!(toDate instanceof Date) || isNaN(toDate.getTime())) {
    throw new RangeError("decayCorrect: toDate must be a valid Date");
  }
  const elapsedDays = (toDate - fromDate) / 86400000;
  return activity * decayFactor(halfLifeDays, elapsedDays);
}

/**
 * Calculates soil activity from deposition.
 * @param {number} depositionKBqPerM2 - Deposition in kBq/m2.
 * @param {number} bulkDensityKgPerM3 - Soil density in kg/m3.
 * @param {number} depthM - Layer depth in m.
 * @returns {number} Activity in Bq/kg.
 */
export function soilActivityBqPerKg(depositionKBqPerM2, bulkDensityKgPerM3, depthM) {
  need("soilActivityBqPerKg", "depositionKBqPerM2", depositionKBqPerM2, v => v >= 0, "must be >= 0");
  need("soilActivityBqPerKg", "bulkDensityKgPerM3", bulkDensityKgPerM3, v => v > 0, "must be > 0");
  need("soilActivityBqPerKg", "depthM", depthM, v => v > 0, "must be > 0");
  return (depositionKBqPerM2 * 1000) / (bulkDensityKgPerM3 * depthM);
}

/**
 * Calculates product activity from soil.
 * @param {number} soilBqPerKg - Soil activity in Bq/kg.
 * @param {number} fv - Transfer factor Fv.
 * @returns {number} Product activity in Bq/kg.
 */
export function productFromSoil(soilBqPerKg, fv) {
  need("productFromSoil", "soilBqPerKg", soilBqPerKg, v => v >= 0, "must be >= 0");
  need("productFromSoil", "fv", fv, v => v >= 0, "must be >= 0");
  return soilBqPerKg * fv;
}

/**
 * Calculates product activity from deposition.
 * @param {number} depositionKBqPerM2 - Deposition in kBq/m2.
 * @param {number} tagM2PerKg - Aggregated transfer factor in m2/kg.
 * @returns {number} Product activity in Bq/kg.
 */
export function productFromDeposition(depositionKBqPerM2, tagM2PerKg) {
  need("productFromDeposition", "depositionKBqPerM2", depositionKBqPerM2, v => v >= 0, "must be >= 0");
  need("productFromDeposition", "tagM2PerKg", tagM2PerKg, v => v >= 0, "must be >= 0");
  return depositionKBqPerM2 * 1000 * tagM2PerKg;
}

/**
 * Converts dry mass activity to fresh mass.
 * @param {number} activityDryBqPerKg - Activity in Bq/kg dry.
 * @param {number} dryMatterPercent - Dry matter percentage (0-100).
 * @returns {number} Activity in Bq/kg fresh.
 */
export function dryToFresh(activityDryBqPerKg, dryMatterPercent) {
  need("dryToFresh", "activityDryBqPerKg", activityDryBqPerKg, v => v >= 0, "must be >= 0");
  need("dryToFresh", "dryMatterPercent", dryMatterPercent, v => v > 0 && v <= 100, "must be between 0 and 100");
  return activityDryBqPerKg * (dryMatterPercent / 100);
}

/**
 * Calculates animal product activity.
 * @param {number} dailyIntakeBqPerDay - Daily intake in Bq/day.
 * @param {number} transferDaysPerKg - Transfer coefficient in d/kg or d/L.
 * @returns {number} Activity in Bq/kg or Bq/L.
 */
export function animalProductBqPerKg(dailyIntakeBqPerDay, transferDaysPerKg) {
  need("animalProductBqPerKg", "dailyIntakeBqPerDay", dailyIntakeBqPerDay, v => v >= 0, "must be >= 0");
  need("animalProductBqPerKg", "transferDaysPerKg", transferDaysPerKg, v => v >= 0, "must be >= 0");
  return dailyIntakeBqPerDay * transferDaysPerKg;
}

/**
 * Calculates deposition from dose rate.
 * @param {number} doseRateNGyPerH - Measured dose rate in nGy/h.
 * @param {number} backgroundNGyPerH - Background dose rate in nGy/h.
 * @param {number} coeffNGyPerHPerKBqM2 - Conversion coefficient in nGy/h per kBq/m2.
 * @returns {number} Deposition in kBq/m2.
 */
export function depositionFromDoseRate(doseRateNGyPerH, backgroundNGyPerH, coeffNGyPerHPerKBqM2) {
  need("depositionFromDoseRate", "doseRateNGyPerH", doseRateNGyPerH, v => v >= 0, "must be >= 0");
  need("depositionFromDoseRate", "backgroundNGyPerH", backgroundNGyPerH, v => v >= 0, "must be >= 0");
  need("depositionFromDoseRate", "coeffNGyPerHPerKBqM2", coeffNGyPerHPerKBqM2, v => v > 0, "must be > 0");
  const diff = doseRateNGyPerH - backgroundNGyPerH;
  return diff < 0 ? 0 : diff / coeffNGyPerHPerKBqM2;
}

export { VERDICT };
