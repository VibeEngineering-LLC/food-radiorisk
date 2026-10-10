// #FR-75: органные эквивалентные дозы от поступления нуклидов с пищей (EPA FGR 13, ингестия, 6 возрастов); эффективная доза — по e(g) калькулятора

export const AGE_KEY = { adult: 'adult', '3m': '3m', '1y': '1y', '1-2y': '1y', '5y': '5y', '10y': '10y', '12-17y': '15y', '15y': '15y' };

export const ORGANS = [
  ['Thyroid', 'Щитовидная железа'],
  ['R_Marrow', 'Красный костный мозг'],
  ['Bone_Sur', 'Поверхность кости'],
  ['Liver', 'Печень'],
  ['Kidneys', 'Почки'],
  ['Spleen', 'Селезёнка'],
  ['St_Wall', 'Стенка желудка'],
  ['SI_Wall', 'Стенка тонкой кишки'],
  ['ULI_Wall', 'Стенка верхнего отдела толстой кишки'],
  ['LLI_Wall', 'Стенка нижнего отдела толстой кишки'],
  ['Breasts', 'Молочные железы'],
  ['Ovaries', 'Яичники'],
  ['Testes', 'Яички'],
  ['Uterus', 'Матка'],
  ['UB_Wall', 'Стенка мочевого пузыря'],
  ['Pancreas', 'Поджелудочная железа'],
  ['Adrenals', 'Надпочечники'],
  ['Brain', 'Головной мозг'],
  ['Muscle', 'Мышцы'],
  ['Skin', 'Кожа'],
  ['Thymus', 'Вилочковая железа']
];

export function organDoses(rows, input, records) {
  if (!Array.isArray(records) || !records.length || !Array.isArray(rows) || !rows.length) return null;
  if (input.lifetime) return { lifetime: true };
  const ageKey = AGE_KEY[input.age];
  if (ageKey === undefined) return null;
  const multi = input.years !== 1;
  const sum = {}, rawSv = {}; // rawSv — суммы по ВСЕМ органам файла FGR 13, в т. ч. дыхательным (для лёгкого, #FR-81 D03)
  let eTotalSv = 0;
  const missing = [];
  const mismatch = [];
  const byNuclide = [];
  for (const r of rows) {
    const intake = multi ? r.intakeBqTotal : r.intakeBqPerYear;
    const cand = records.filter(x => x.nuclide === r.nuclide && x.age === ageKey);
    if (!cand.length) { missing.push(r.nuclide); continue; }
    // несколько химических форм — берём ближайшую по e(g) калькулятора
    const pick = Number.isFinite(r.eSvPerBq) && r.eSvPerBq > 0
      ? cand.reduce((a, b) => Math.abs(a.e50 - r.eSvPerBq) < Math.abs(b.e50 - r.eSvPerBq) ? a : b)
      : cand[0];
    const rel = Math.abs(pick.e50 - r.eSvPerBq) / r.eSvPerBq;
    if (Number.isFinite(rel) && rel > 0.25) mismatch.push({ nuclide: r.nuclide, rel });
    eTotalSv += intake * r.eSvPerBq;
    // орган с наибольшей дозой для нуклида — в основную таблицу (доза за год, как в колонке «Доза»)
    const [topId, topLabel] = ORGANS.reduce((a, b) => (pick.organs[b[0]] || 0) > (pick.organs[a[0]] || 0) ? b : a);
    byNuclide.push({ nuclide: r.nuclide, formIdx: pick.form_idx, id: topId, label: topLabel, doseSvPerYear: r.intakeBqPerYear * (pick.organs[topId] || 0), ratio: r.eSvPerBq > 0 ? (pick.organs[topId] || 0) / r.eSvPerBq : null });
    for (const [id, v] of Object.entries(pick.organs)) if (Number.isFinite(v)) rawSv[id] = (rawSv[id] || 0) + intake * v;
    for (const [id] of ORGANS) {
      const v = pick.organs[id];
      if (Number.isFinite(v)) sum[id] = (sum[id] || 0) + intake * v;
    }
  }
  const organs = ORGANS
    .map(([id, label]) => ({ id, label, doseSv: sum[id] || 0, ratio: eTotalSv > 0 ? (sum[id] || 0) / eTotalSv : null }))
    .filter(o => o.doseSv > 0)
    .sort((a, b) => b.doseSv - a.doseSv);
  return { ageKey, multi, eTotalSv, organs, rawSv, missing, mismatch, byNuclide };
}
