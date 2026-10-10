// #FR-88 v19 (D-029): А-1 и Q1-Q6 — спорные правила расчёта
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { pickNormRecord } from '../src/calc/norms.js';
import { combineFr } from '../src/calc/processing.js';

test('А-1: Сравнение списков норм для Sr-90 в разных видах воды', () => {
  const r1 = computeScenario(data, inputFor(null, 'вода из крана', [['Sr-90', 9.8]]));
  // бутилированная: группа норм ТР ЕАЭС 044 — 'water'; из-под крана группы норм нет
  const r2 = computeScenario(data, inputFor('water', 'вода минеральная', [['Sr-90', 9.8]]));
  assert.ok(r1.ok && r2.ok);
  const ids1 = r1.limits.foreign.map(x => x.id).sort();
  const ids2 = r2.limits.foreign.map(x => x.id).sort();
  assert.deepEqual(ids1, ids2);
  assert.ok(ids1.includes('us_epa_mcl_sr90_tableA'));
  assert.ok(ids1.includes('eu_2016_52_a1_sr_liquid'));
  assert.ok(ids1.includes('iaea_tecdoc1788_who_sr90_i131_cs_u238'));
});

test('Q1: Проверка предупреждений при отсутствии коэффициента перехода', () => {
  const ids = ['lysenko17_butter_90pct','lysenko17_meat_boil_2kg_1h','melchenko16_potato_soak','tec16_txt_alcohol_oil','tec16_txt_dried_milk'];
  for (const id of ids) {
    const r = computeScenario(data, inputFor('milk_products', 'Сметана', [['Cs-137', 100]], { processing: { mode: 'record', recordId: id, variant: 'best' } }));
    const base = computeScenario(data, inputFor('milk_products', 'Сметана', [['Cs-137', 100]], { processing: { mode: 'none', fr: 1, variant: 'best' } }));
    assert.ok(r.ok);
    assert.equal(r.rows[0].frUsed, 1);
    assert.equal(r.rows[0].doseSvTotal, base.rows[0].doseSvTotal);
    assert.ok(r.warnings.some(w => /коэффициент перехода для Cs-137 не установлен/.test(w)));
    assert.ok(!r.warnings.some(w => /для радионуклидов вообще, а не для/.test(w)));
  }
});

test('Q2: общий Fr составной обработки — наибольший из применимых, без перемножения накопленных', () => {
  const it = (value, cumulative = null) => ({ rec: { cumulative }, value });
  assert.equal(combineFr([it(0.525,true), it(0.275,true)]).fr, 0.525);
  assert.equal(combineFr([it(0.11,true), it(0.04)]).fr, 0.11);
  assert.equal(combineFr([it(0.04,true), it(0.5)]).fr, 0.5);
  assert.ok(Math.abs(combineFr([it(0.5), it(0.2)]).fr - 0.1) < 1e-12);
  // то же на реальных записях: накопленные varf19_* и обычная trs77_mushrooms_washing_cs_137
  const r1 = computeScenario(data, inputFor('other', 'Сырьё', [['Cs-137', 100]], { processing: { mode: 'record', recordIds: ['varf19_salting_total', 'varf19_soaking_total'], variant: 'best' } }));
  const r2 = computeScenario(data, inputFor('other', 'Сырьё', [['Cs-137', 100]], { processing: { mode: 'record', recordIds: ['varf19_salting_total', 'trs77_mushrooms_washing_cs_137'], variant: 'best' } }));
  assert.equal(r1.rows[0].frUsed, 0.65);
  assert.equal(r2.rows[0].frUsed, 0.4);
});

test('Q3: Обработка записей без рекомендованного значения', () => {
  const recId = 'trs75_cream_method_not_specified_in_the_tabl_pb_zn';
  const rMin = computeScenario(data, inputFor('milk_products', 'Сливки', [['Cs-137', 100]], { processing: { mode: 'record', recordId: recId, variant: 'min' } }));
  const rMax = computeScenario(data, inputFor('milk_products', 'Сливки', [['Cs-137', 100]], { processing: { mode: 'record', recordId: recId, variant: 'max' } }));
  const rBest = computeScenario(data, inputFor('milk_products', 'Сливки', [['Cs-137', 100]], { processing: { mode: 'record', recordId: recId, variant: 'best' } }));
  assert.ok(rMin.ok && rMax.ok && rBest.ok);
  // сообщение «рекомендованного нет» при явном min/max и при «рекомендованное» — tests/fr88_v20.test.js (А-1)
  assert.equal(rMin.rows[0].doseSvTotal, rBest.rows[0].doseSvTotal);
  assert.equal(rMax.rows[0].doseSvTotal, rBest.rows[0].doseSvTotal);
});

test('Q4: Выбор нормы при неоднозначности и учете коэффициента сушки', () => {
  const rec1 = pickNormRecord(data.limits_ru, 'fats_oils', 'Sr-90', null, 'fresh');
  assert.equal(rec1.rec.id, 't021_p4_r11_sr90');
  assert.equal(rec1.ambiguous, true);
  const rev = [...data.limits_ru].reverse();
  const rec2 = pickNormRecord(rev, 'fats_oils', 'Sr-90', null, 'fresh');
  assert.equal(rec2.rec.id, 't021_p4_r11_sr90');
  const rec3 = pickNormRecord(data.limits_ru, 'milk_products', 'Sr-90', null, 'fresh');
  assert.equal(rec3.rec.id, 't021_p4_r10_sr90');
  // сушёный при ручной группе: v20 (D-029, V-2) выбирает строку по наибольшему B после пересчёта на K — см. tests/fr88_v20.test.js
});

test('Q5: Оценка депонирования и фильтрация записей по годам', () => {
  const nuc = (extra) => ({ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 }, ...extra });
  const run = (n) => computeScenario(data, inputFor(null, 'черника лесная', [], { dryMatterPercent: 15, nuclides: [nuc(n)] }));
  const est = (n) => run(n).rows[0].depositionEstimate;
  const rec = data.transfer.find(r => r.id === 'trs472_tag_cs_137_alpine_grassland_vegetation_sand_sand');
  assert.equal(rec.am, 0.021);
  assert.equal(rec.gm, 0.014);
  const e1 = est({transferId: rec.id});
  assert.ok(Math.abs(e1.coeffM2PerKg.central - rec.am * rec.unit_factor) < 1e-12 * rec.am * rec.unit_factor);
  assert.notEqual(e1.coeffM2PerKg.central, rec.gm * rec.unit_factor);
  const e2 = est({transferId:'ALL', transferIds:[rec.id]});
  assert.equal(e2.kBqPerM2.central, e1.kBqPerM2.central);
  const kp = data.transfer.filter(r => r.nuclide === 'Cs-137' && /черник/i.test(r.item_ru) && ['Tag','KP'].includes(r.quantity) && r.mass_basis != null && r.level === '✅' && !r.source_anomaly);
  const early = kp.find(r => /1986/.test(r.item_ru));
  const normal = kp.find(r => !/1986/.test(r.item_ru));
  assert.ok(early && normal);
  const s = est({transferId:'ALL', transferIds:[early.id, normal.id]}).summary;
  assert.equal(s.used, 1);
  assert.equal(s.total, 2);
  assert.equal(s.early, 1);
  const kl = est({transferId: 'perevolotsky2006_kp_cs137_bilberry_long_term'}).kBqPerM2;
  assert.equal(kl.central, null);
  const e3 = est({transferId:'ALL', transferIds:['perevolotsky2006_kp_cs137_bilberry_long_term']}).kBqPerM2;
  assert.equal(e3.central, Math.sqrt(kl.min * kl.max));
});

test('Q6: Проверка HTML-справки и данных по EU 2016/52', () => {
  const html = readFileSync(new URL('../sources.html', import.meta.url), 'utf8');
  const list = html.match(/<ul id="limits-list">([\s\S]*?)<\/ul>/)[1];
  const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]);
  const target = items.find(item => item.includes('2016/52') && /10 суток/.test(item) && item.includes('H-3, C-14 и K-40') && !item.includes('[текст'));
  assert.ok(target);
  const rec = data.limits_foreign.find(r => r.id === 'eu_2016_52_a1_other_cs_infant');
  assert.deepEqual(rec.nuclides, ['group: Sum of all other nuclides of half-life greater than 10 days, notably Cs-134 and Cs-137']);
});
