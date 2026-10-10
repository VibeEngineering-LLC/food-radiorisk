// #FR-75: риск рака по локализациям (EPA FGR 13) — данные, выбор полосы возраста и формы, суммирование, граничные случаи
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { organRisk, SITES, BAND_OF } from '../src/calc/organ_risk.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, rel = 1e-9) => assert.ok(Math.abs(a - e) <= rel * Math.abs(e), `expected ${e}, got ${a}`);
const rec = (nuclide, band, form = 0) => data.organ_risk.find(x => x.nuclide === nuclide && x.age_band === band && x.form_idx === form);
const row = (nuclide, bq) => ({ nuclide, intakeBqPerYear: bq, intakeBqTotal: bq * 10 });
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, riskCoeffPerSv: 0.05, ...over });
const site = (res, id) => res.sites.find(s => s.id === id);

test('набор данных: 12 нуклидов × 5 полос возраста, у Po-210 две формы, суммы по локализациям сходятся с Total', () => {
  const nuclides = new Set(data.organ_risk.map(x => x.nuclide));
  assert.equal(nuclides.size, 12);
  for (const nuclide of nuclides) {
    for (const band of ['0-5', '5-15', '15-25', '25-70', '0-110']) {
      assert.ok(rec(nuclide, band));
    }
  }
  assert.ok(rec('Po-210', '0-110', 1));
  assert.equal(data.organ_risk.length, 65);
  for (const r of data.organ_risk) {
    for (const m of ['mortality', 'morbidity']) {
      const s = SITES.reduce((a, [id]) => a + r[m][id], 0);
      assert.ok(Math.abs(s / r['total_' + m] - 1) < 0.02);
    }
  }
});

test('цезий-137, 0-110: итог смертности и заболеваемости совпадает с таблицей 2.2a отчёта EPA', () => {
  close(rec('Cs-137', '0-110').total_mortality, 6.88e-10, 1e-3); // EPA FGR 13, табл. 2.2a, пища
  close(rec('Cs-137', '0-110').total_morbidity, 1.01e-9, 1e-2);
});

test('йод-131, взрослый: полоса 25–70, щитовидная железа — первая, риск = поступление × коэффициент', () => {
  const res = organRisk([row('I-131', 1000)], inp(), data.organ_risk, null);
  assert.equal(res.band, '25-70');
  assert.equal(res.sites[0].id, 'thyroid');
  close(site(res, 'thyroid').morbidity, 1000 * rec('I-131', '25-70').morbidity.thyroid);
  close(site(res, 'thyroid').mortality, 1000 * rec('I-131', '25-70').mortality.thyroid);
  close(res.totalMorbidity, 1000 * rec('I-131', '25-70').total_morbidity);
  assert.deepEqual(res.missing, []);
  assert.equal(res.nominal, null);
});

test('возрасты калькулятора → полосы', () => {
  assert.deepEqual(['3m', '1y', '1-2y', '5y', '10y', '12-17y', '15y', 'adult'].map(a => BAND_OF[a]), ['0-5', '0-5', '0-5', '5-15', '5-15', '15-25', '15-25', '25-70']);
  const res = organRisk([row('Sr-90', 1000)], inp({ age: '5y' }), data.organ_risk, null);
  assert.equal(res.band, '5-15');
  close(res.totalMortality, 1000 * rec('Sr-90', '5-15').total_mortality);
});

test('несколько лет: поступление за весь срок; два нуклида складываются', () => {
  const res = organRisk([row('I-131', 1000), row('Cs-137', 5000)], inp({ years: 10 }), data.organ_risk, null);
  close(res.totalMorbidity, 10000 * rec('I-131', '25-70').total_morbidity + 50000 * rec('Cs-137', '25-70').total_morbidity);
  assert.equal(res.multi, true);
  close(site(res, 'thyroid').morbidity, 10000 * rec('I-131', '25-70').morbidity.thyroid + 50000 * rec('Cs-137', '25-70').morbidity.thyroid);
  close(site(res, 'liver').mortality, 10000 * rec('I-131', '25-70').mortality.liver + 50000 * rec('Cs-137', '25-70').mortality.liver);
});

test('химическая форма из результата органных доз; без неё — первая', () => {
  const org = { eTotalSv: 1e-5, byNuclide: [{ nuclide: 'Po-210', formIdx: 1 }] };
  const a = organRisk([row('Po-210', 1000)], inp(), data.organ_risk, org);
  close(a.totalMorbidity, 1000 * rec('Po-210', '25-70', 1).total_morbidity);
  const b = organRisk([row('Po-210', 1000)], inp(), data.organ_risk, null);
  close(b.totalMorbidity, 1000 * rec('Po-210', '25-70', 0).total_morbidity);
  assert.notEqual(a.totalMorbidity, b.totalMorbidity);
});

test('номинальный риск по эффективной дозе берётся из результата органных доз', () => {
  const res = organRisk([row('I-131', 1000)], inp({ riskCoeffPerSv: 0.057 }), data.organ_risk, { eTotalSv: 1e-5, byNuclide: [] }, 0.05);
  close(res.nominal, 1e-5 * 0.05);
});

test('режим «с N до M лет», нет данных, неизвестный возраст — без расчёта; нуклид без записи — в missing', () => {
  assert.deepEqual(organRisk([row('I-131', 1)], inp({ lifetime: { fromAge: 5, toAge: 70 } }), data.organ_risk, null), { lifetime: true });
  assert.equal(organRisk([], inp(), data.organ_risk, null), null);
  assert.equal(organRisk([row('I-131', 1)], inp(), [], null), null);
  assert.equal(organRisk([row('I-131', 1)], inp({ age: 'zzz' }), data.organ_risk, null), null);
  const m = organRisk([row('I-131', 1000), row('Xx-999', 1)], inp(), data.organ_risk, null);
  assert.deepEqual(m.missing, ['Xx-999']);
  const all = organRisk([row('Xx-999', 1)], inp(), data.organ_risk, null);
  assert.deepEqual(all.sites, []);
  assert.equal(all.totalMorbidity, 0);
});

test('локализации по убыванию заболеваемости; без нулевых строк', () => {
  const res = organRisk([row('Ra-226', 1000)], inp(), data.organ_risk, null);
  for (let i = 1; i < res.sites.length; i++) {
    assert.ok(res.sites[i - 1].morbidity >= res.sites[i].morbidity);
  }
  assert.ok(res.sites.every(s => s.morbidity > 0 || s.mortality > 0));
});
