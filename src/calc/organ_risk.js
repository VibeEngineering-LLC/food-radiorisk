// #FR-75: риск рака по локализациям от поступления нуклидов с пищей (EPA FGR 13, файл RBS); полосы возраста — по возрастной группе калькулятора
// полоса возраста поступления в файле EPA: правило соответствия — предложение исполнителя (audit/fgr13-risk-format-2026-10-04.md, п. 5)
export const BAND_OF = { adult: '25-70', '15y': '15-25', '12-17y': '15-25', '10y': '5-15', '5y': '5-15', '1y': '0-5', '1-2y': '0-5', '3m': '0-5' };
export const SITES = [ ['thyroid', 'Щитовидная железа'], ['leukemia', 'Лейкоз (красный костный мозг)'], ['bone', 'Кость (саркома)'], ['colon', 'Толстая кишка'], ['stomach', 'Желудок'], ['liver', 'Печень'], ['lung', 'Лёгкие'], ['breast', 'Молочная железа'], ['ovary', 'Яичники'], ['bladder', 'Мочевой пузырь'], ['kidney', 'Почки'], ['esophagus', 'Пищевод'], ['skin', 'Кожа'], ['residual', 'Прочие органы (мышцы, поджелудочная железа, надпочечники)'] ];
// #FR-76: орган, чья доза от того же продукта стоит рядом с локализацией (коды органов FGR 13 — как в organ.js); у lung, esophagus, residual органа в наборе доз нет
export const ORGAN_OF_SITE = { thyroid: ['Thyroid'], leukemia: ['R_Marrow'], bone: ['Bone_Sur'], colon: ['ULI_Wall', 'LLI_Wall'], stomach: ['St_Wall'], liver: ['Liver'], breast: ['Breasts'], ovary: ['Ovaries'], bladder: ['UB_Wall'], kidney: ['Kidneys'], skin: ['Skin'], lung: [], esophagus: [], residual: [] };
// #FR-81 D03: доза локализации по EPA FGR 13, табл. 7.4 (b-spec F-51): толстая кишка = 0,568·ULI + 0,432·LLI; пищевод = вилочковая железа;
// лёгкое = (BBi-bas + BBi-sec)/6 + (bbe-sec + AI)/3; прочие = (мышцы + поджелудочная + надпочечники)/3
export const SITE_FORMULAS = {
  colon: { label: 'Толстая кишка (0,568·верхний отдел + 0,432·нижний отдел)', parts: [['ULI_Wall', 0.568], ['LLI_Wall', 0.432]] },
  esophagus: { label: 'Пищевод (по вилочковой железе)', parts: [['Thymus', 1]] },
  lung: { label: 'Лёгкие (бронхи и альвеолы, веса FGR 13)', parts: [['BBi-bas', 1 / 6], ['BBi-sec', 1 / 6], ['bbe-sec', 1 / 3], ['AI', 1 / 3]] },
  residual: { label: 'Прочие органы (среднее: мышцы, поджелудочная, надпочечники)', parts: [['Muscle', 1 / 3], ['Pancreas', 1 / 3], ['Adrenals', 1 / 3]] }
};
export function siteOrganDose(siteId, organs) {
  const f = SITE_FORMULAS[siteId];
  if (f) {
    const raw = organs?.rawSv || Object.fromEntries((Array.isArray(organs?.organs) ? organs.organs : []).map(o => [o.id, o.doseSv]));
    if (!f.parts.every(([id]) => Number.isFinite(raw[id]))) return null;
    return { organId: siteId, label: f.label, doseSv: f.parts.reduce((s, [id, w]) => s + w * raw[id], 0) };
  }
  const list = organs && Array.isArray(organs.organs) ? organs.organs : [];
  const found = (ORGAN_OF_SITE[siteId] || []).map(id => list.find(o => o.id === id)).filter(Boolean);
  if (!found.length) return null;
  const top = found.reduce((a, b) => b.doseSv > a.doseSv ? b : a);
  return { organId: top.id, label: top.label, doseSv: top.doseSv };
}
export function organRisk(rows, input, records, organs, riskCoeff) {
  if (!Array.isArray(records) || !records.length || !Array.isArray(rows) || !rows.length) return null;
  if (input.lifetime) return { lifetime: true };
  const band = BAND_OF[input.age];
  if (band === undefined) return null;
  const multi = input.years !== 1;
  const mort = {}, morb = {};
  let totalMortality = 0, totalMorbidity = 0;
  const missing = [];
  const byNuclide = [];
  for (const r of rows) {
    const intake = multi ? r.intakeBqTotal : r.intakeBqPerYear;
    const form = organs?.byNuclide?.find(b => b.nuclide === r.nuclide)?.formIdx ?? 0;
    const rec = records.find(x => x.nuclide === r.nuclide && x.age_band === band && x.form_idx === form) || records.find(x => x.nuclide === r.nuclide && x.age_band === band);
    if (!rec) { missing.push(r.nuclide); continue; }
    byNuclide.push({ nuclide: r.nuclide, intakeBq: intake, morbidity: intake * rec.total_morbidity, mortality: intake * rec.total_mortality });
    totalMortality += intake * rec.total_mortality;
    totalMorbidity += intake * rec.total_morbidity;
    for (const [id] of SITES) {
      mort[id] = (mort[id] || 0) + intake * (rec.mortality[id] || 0);
      morb[id] = (morb[id] || 0) + intake * (rec.morbidity[id] || 0);
    }
  }
  const sites = SITES.map(([id, label]) => ({ id, label, mortality: mort[id] || 0, morbidity: morb[id] || 0, organDose: siteOrganDose(id, organs) })).filter(s => s.morbidity > 0 || s.mortality > 0).sort((a, b) => b.morbidity - a.morbidity);
  const nominal = organs && Number.isFinite(organs.eTotalSv) && Number.isFinite(riskCoeff) ? organs.eTotalSv * riskCoeff : null;
  for (const b of byNuclide) b.shareMorbidity = totalMorbidity > 0 ? b.morbidity / totalMorbidity : null;
  byNuclide.sort((a, b) => b.morbidity - a.morbidity);
  return { band, multi, sites, byNuclide, totalMortality, totalMorbidity, nominal, missing };
}
