// #FR-75: органные эквивалентные дозы — выбор возраста и формы, суммирование нуклидов, граничные случаи
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { organDoses, ORGANS, AGE_KEY } from '../src/calc/organ.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, rel = 1e-9) => assert.ok(Math.abs(a - e) <= rel * Math.abs(e), `expected ${e}, got ${a}`);
const rec = (nuclide, age, i = 0) => data.organ_dose.filter(x => x.nuclide === nuclide && x.age === age)[i];
const row = (nuclide, bq, e) => ({ nuclide, intakeBqPerYear: bq, intakeBqTotal: bq * 10, eSvPerBq: e });
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, ...over });
const org = (res, id) => res.organs.find(o => o.id === id);

test('набор данных: 12 нуклидов, 6 возрастов, 21 орган из таблицы есть в каждой записи', () => {
  const nuclides = new Set(data.organ_dose.map(x => x.nuclide));
  assert.equal(nuclides.size, 12);
  for (const nuclide of nuclides) {
    for (const age of ['3m','1y','5y','10y','15y','adult']) {
      assert.ok(rec(nuclide, age));
    }
  }
  for (const record of data.organ_dose) {
    for (const [id] of ORGANS) {
      assert.ok(Number.isFinite(record.organs[id]));
    }
  }
});

test('йод-131, взрослый: доза щитовидной железы = поступление × коэффициент EPA, она наибольшая', () => {
  const r = rec('I-131', 'adult');
  const res = organDoses([row('I-131', 1000, 2.2e-8)], inp(), data.organ_dose);
  close(org(res, 'Thyroid').doseSv, 1000 * r.organs.Thyroid);
  close(org(res, 'Thyroid').doseSv, 4.321e-4, 1e-3); // значение из FGR13ING.GDB, Зв/Бк 4,321e-7
  assert.equal(res.organs[0].id, 'Thyroid');
  close(res.eTotalSv, 1000 * 2.2e-8);
  close(org(res, 'Thyroid').ratio, org(res, 'Thyroid').doseSv / (1000 * 2.2e-8));
  assert.deepEqual(res.missing, []);
});

test('йод-131, ребёнок 1 год: другой возрастной коэффициент', () => {
  const res = organDoses([row('I-131', 1000, 1.8e-7)], inp({ age: '1y' }), data.organ_dose);
  close(org(res, 'Thyroid').doseSv, 3.563e-3, 1e-3); // 3,563e-6 Зв/Бк из FGR13ING.GDB
  assert.equal(res.ageKey, '1y');
});

test('ключи возрастов калькулятора: 12–17 лет — как 15 лет, 1–2 года — как 1 год', () => {
  assert.equal(AGE_KEY['12-17y'], '15y');
  assert.equal(AGE_KEY['1-2y'], '1y');
  const a = organDoses([row('I-131', 1000, 1.8e-7)], inp({ age: '12-17y' }), data.organ_dose);
  close(org(a, 'Thyroid').doseSv, 1000 * rec('I-131', '15y').organs.Thyroid);
});

test('несколько лет: берётся поступление за весь срок', () => {
  const res = organDoses([row('I-131', 1000, 2.2e-8)], inp({ years: 10 }), data.organ_dose);
  close(org(res, 'Thyroid').doseSv, 10000 * rec('I-131', 'adult').organs.Thyroid);
  assert.equal(res.multi, true);
  close(res.eTotalSv, 10000 * 2.2e-8);
});

test('два нуклида: органные дозы складываются', () => {
  const res = organDoses([row('I-131', 1000, 2.2e-8), row('Cs-137', 5000, 1.3e-8)], inp(), data.organ_dose);
  const exp = 1000 * rec('I-131', 'adult').organs.Liver + 5000 * rec('Cs-137', 'adult').organs.Liver;
  close(org(res, 'Liver').doseSv, exp);
  close(res.eTotalSv, 1000 * 2.2e-8 + 5000 * 1.3e-8);
});

test('режим «с N до M лет», нет данных, неизвестный возраст — без расчёта', () => {
  assert.deepEqual(organDoses([row('I-131', 1, 2.2e-8)], inp({ lifetime: { fromAge: 5, toAge: 70 } }), data.organ_dose), { lifetime: true });
  assert.equal(organDoses([], inp(), data.organ_dose), null);
  assert.equal(organDoses([row('I-131', 1, 2.2e-8)], inp(), []), null);
  assert.equal(organDoses([row('I-131', 1, 2.2e-8)], inp({ age: 'zzz' }), data.organ_dose), null);
});

test('нуклид без записи — в missing; расхождение e(g) больше 25 % — в mismatch', () => {
  const res = organDoses([row('I-131', 1000, 2.2e-8), row('Xx-999', 1000, 1e-8)], inp(), data.organ_dose);
  assert.deepEqual(res.missing, ['Xx-999']);
  const m = organDoses([row('I-131', 1000, 1e-7)], inp(), data.organ_dose);
  assert.equal(m.mismatch.length, 1);
  assert.equal(m.mismatch[0].nuclide, 'I-131');
  assert.deepEqual(res.mismatch, []);
});

test('несколько химических форм: берётся ближайшая по e(g) калькулятора', () => {
  const forms = data.organ_dose.filter(x => x.nuclide === 'Po-210' && x.age === 'adult');
  assert.ok(forms.length >= 2);
  for (const f of forms) {
    const res = organDoses([row('Po-210', 1000, f.e50)], inp(), data.organ_dose);
    for (const o of res.organs) {
      close(o.doseSv, 1000 * f.organs[o.id]);
    }
  }
  assert.notEqual(forms[0].e50, forms[1].e50);
});

test('самый нагруженный орган по нуклидам: йод-131 — щитовидная железа, доза за год', () => {
  const res = organDoses([row('I-131', 1000, 2.2e-8), row('Cs-137', 5000, 1.3e-8)], inp({ years: 10 }), data.organ_dose);
  const i = res.byNuclide.find(x => x.nuclide === 'I-131');
  assert.equal(i.id, 'Thyroid');
  close(i.doseSvPerYear, 1000 * rec('I-131', 'adult').organs.Thyroid);
  close(i.ratio, rec('I-131', 'adult').organs.Thyroid / 2.2e-8);
  assert.equal(res.byNuclide.length, 2);
  assert.ok(res.byNuclide.find(x => x.nuclide === 'Cs-137').ratio < 2);
});

test('все нуклиды без записи: список органов пуст, без нулевых строк', () => {
  const res = organDoses([row('Xx-999', 1000, 1e-8)], inp(), data.organ_dose);
  assert.deepEqual(res.organs, []);
  assert.deepEqual(res.missing, ['Xx-999']);
});

test('ссылка на источник: номер строки — это строка L записи в FGR13ING.GDB', () => {
  const r = rec('Ra-226', 'adult');
  assert.match(r.loc, /^FGR13ING\.GDB, строка \d+$/);
  const n = Number(r.loc.match(/\d+$/)[0]);
  assert.ok(n > 2 && n < 100000);
});

test('альфа-излучение: у радия-226 доза поверхности кости больше эффективной', () => {
  const res = organDoses([row('Ra-226', 1000, 2.8e-7)], inp(), data.organ_dose);
  assert.equal(res.organs[0].id, 'Bone_Sur');
  assert.ok(org(res, 'Bone_Sur').ratio > 1);
});
