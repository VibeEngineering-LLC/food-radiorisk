// #FR-85 v14 п. 7 (D-025 п. 3): уровни вмешательства НРБ-99/2009 Прил. 2а для питьевой воды нецентрализованного водоснабжения.
// Числа — только из data.dose_coeff (поле uv_bq_per_kg записей NRB2009_App2a); нуклид без записи — «не установлено» (uv: null), число не подставляется.
export const UV_SOURCE = 'NRB2009_App2a';

export function interventionLevels(doseCoeff, rows) {
  const list = (Array.isArray(doseCoeff) ? doseCoeff : []).filter(d => d.source === UV_SOURCE && Number.isFinite(d.uv_bq_per_kg));
  return (rows || []).map(r => {
    const d = list.find(x => x.nuclide === r.nuclide);
    const base = { nuclide: r.nuclide, activity: r.rawBqPerKg, unit: 'Bq/kg' };
    if (!d) return { ...base, uv: null, ratio: null, age: null, id: null, loc: null };
    return { ...base, uv: d.uv_bq_per_kg, ratio: r.rawBqPerKg / d.uv_bq_per_kg, age: d.age, id: d.id, loc: d.loc };
  });
}
