// #FR-76: добавочный риск от продукта — соответствие локализация→орган, доза органа рядом с локализацией, вклад нуклидов (byNuclide)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { organDoses, ORGANS } from '../src/calc/organ.js';
import { organRisk, siteOrganDose, ORGAN_OF_SITE, SITES } from '../src/calc/organ_risk.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, rel = 1e-9) => assert.ok(Math.abs(a - e) <= rel * Math.abs(e), `expected ${e}, got ${a}`);
const rec = (nuclide, band, form = 0) => data.organ_risk.find(x => x.nuclide === nuclide && x.age_band === band && x.form_idx === form);
const row = (nuclide, bq, e) => ({ nuclide, intakeBqPerYear: bq, intakeBqTotal: bq * 10, eSvPerBq: e });
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, riskCoeffPerSv: 0.05, ...over });
const fake = (extra = {}) => ({ organs: ORGANS.map(([id, label], i) => ({ id, label, doseSv: (i + 1) * 1e-6, ...(extra[id] !== undefined ? { doseSv: extra[id] } : {}) })) });
const doseOf = (id) => fake().organs.find(o => o.id === id).doseSv;

test('локализация → орган: каждая локализация берёт дозу своего органа; пищевод и прочие — по FGR 13 (#FR-81 D03), лёгкие без дыхательных органов — прочерк', () => {
  const expected = { thyroid: 'Thyroid', leukemia: 'R_Marrow', bone: 'Bone_Sur', stomach: 'St_Wall', liver: 'Liver', breast: 'Breasts', ovary: 'Ovaries', bladder: 'UB_Wall', kidney: 'Kidneys', skin: 'Skin' };
  for (const [site, organ] of Object.entries(expected)) {
    const d = siteOrganDose(site, fake());
    assert.equal(d.organId, organ);
    assert.equal(d.doseSv, doseOf(organ));
  }
  assert.equal(siteOrganDose('esophagus', fake()).doseSv, doseOf('Thymus'));
  close(siteOrganDose('residual', fake()).doseSv, (doseOf('Muscle') + doseOf('Pancreas') + doseOf('Adrenals')) / 3);
  assert.equal(siteOrganDose('lung', fake()), null);
  assert.deepEqual(SITES.map(([id]) => id).sort(), Object.keys(ORGAN_OF_SITE).sort());
});

test('толстая кишка: 0,568·верхний + 0,432·нижний (FGR 13, табл. 7.4), а не большее из двух; без одного из отделов — прочерк', () => {
  const a = siteOrganDose('colon', fake({ ULI_Wall: 5e-3, LLI_Wall: 2e-3 }));
  close(a.doseSv, 0.568 * 5e-3 + 0.432 * 2e-3);
  const b = siteOrganDose('colon', fake({ ULI_Wall: 2e-3, LLI_Wall: 5e-3 }));
  close(b.doseSv, 0.568 * 2e-3 + 0.432 * 5e-3);
  assert.equal(siteOrganDose('colon', { organs: [{ id: 'LLI_Wall', label: 'x', doseSv: 7e-4 }] }), null);
});

test('нет данных об органах: organs пустой, null, режим lifetime или орган не в списке → null', () => {
  assert.equal(siteOrganDose('thyroid', null), null);
  assert.equal(siteOrganDose('thyroid', { lifetime: true }), null);
  assert.equal(siteOrganDose('thyroid', { organs: [] }), null);
  assert.equal(siteOrganDose('unknown', fake()), null);
});

test('йод-131, взрослый, 1 год: доза органа рядом с щитовидной железой — из расчёта органных доз того же поступления', () => {
  const rows = [row('I-131', 1000, 1.5e-8)];
  const organs = organDoses(rows, inp(), data.organ_dose);
  const res = organRisk(rows, inp(), data.organ_risk, organs);
  const th = res.sites.find(s => s.id === 'thyroid');
  assert.equal(th.organDose.organId, 'Thyroid');
  assert.equal(th.organDose.doseSv, organs.organs.find(o => o.id === 'Thyroid').doseSv);
  assert.ok(th.organDose.doseSv > 0);
  // #FR-81 D03: лёгкое, пищевод, прочие — доза по FGR 13 из тех же органных доз (rawSv), а не прочерк
  const raw = organs.rawSv;
  for (const id of ['lung', 'esophagus', 'residual']) {
    const s = res.sites.find(x => x.id === id);
    if (s) assert.ok(s.organDose && s.organDose.doseSv > 0, id);
  }
  const lung = res.sites.find(s => s.id === 'lung');
  if (lung) close(lung.organDose.doseSv, (raw['BBi-bas'] + raw['BBi-sec']) / 6 + (raw['bbe-sec'] + raw.AI) / 3);
  assert.ok(organRisk(rows, inp(), data.organ_risk, null).sites.every(s => s.organDose === null));
});

test('вклад нуклидов: два нуклида, несколько лет — риск, поступление и доли по формулам, доли в сумме 1, порядок по убыванию', () => {
  const rows = [row('I-131', 1000, 1.5e-8), row('Cs-137', 5000, 1.3e-8)];
  const res = organRisk(rows, inp({ years: 10 }), data.organ_risk, null);
  const mI = 10000 * rec('I-131', '25-70').total_morbidity;
  const mC = 50000 * rec('Cs-137', '25-70').total_morbidity;
  assert.equal(res.byNuclide.length, 2);
  const i = res.byNuclide.find(b => b.nuclide === 'I-131');
  const c = res.byNuclide.find(b => b.nuclide === 'Cs-137');
  close(i.morbidity, mI);
  close(c.morbidity, mC);
  close(i.mortality, 10000 * rec('I-131', '25-70').total_mortality);
  close(c.mortality, 50000 * rec('Cs-137', '25-70').total_mortality);
  close(i.intakeBq, 10000);
  close(c.intakeBq, 50000);
  close(i.shareMorbidity, mI / (mI + mC));
  close(c.shareMorbidity, mC / (mI + mC));
  close(i.shareMorbidity + c.shareMorbidity, 1);
  close(res.totalMorbidity, mI + mC);
  for (let k = 1; k < res.byNuclide.length; k++) assert.ok(res.byNuclide[k - 1].morbidity >= res.byNuclide[k].morbidity);
});

test('вклад нуклидов за 1 год берёт годовое поступление; один нуклид — доля 1; нуклид без записи в byNuclide не попадает, а пустой итог даёт пустой список', () => {
  const one = organRisk([row('I-131', 1000, 1.5e-8)], inp(), data.organ_risk, null);
  assert.equal(one.byNuclide.length, 1);
  close(one.byNuclide[0].intakeBq, 1000);
  close(one.byNuclide[0].shareMorbidity, 1);
  const two = organRisk([row('I-131', 1000, 1.5e-8), row('Xx-999', 1, 1e-9)], inp(), data.organ_risk, null);
  assert.deepEqual(two.byNuclide.map(b => b.nuclide), ['I-131']);
  assert.deepEqual(two.missing, ['Xx-999']);
  const none = organRisk([row('Xx-999', 1, 1e-9)], inp(), data.organ_risk, null);
  assert.deepEqual(none.byNuclide, []);
  assert.equal(none.totalMorbidity, 0);
});
