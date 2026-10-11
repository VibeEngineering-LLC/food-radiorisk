import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { REGIONS } from '../src/calc/region.js';
import { buildDoseSlices, SLICE_COLOR } from '../src/calc/dose_sources.js';
import { homeRadonDoseSv, homeDwellingDoseSv } from '../src/calc/summary_charts.js';

const scen = (region, over = {}) => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...over });
const cmpOf = (region, over) => computeScenario(data, scen(region, over)).comparison;
const closeTo = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);
const byId = (ds, id) => ds.slices.find(s => s.id === id);
const rec = (id) => data.compare.find(r => r.id === id);
const IDS = { world: { cosmic: ['w26_cosmic'], terrestrial: ['w26_terr'], internal: ['w26_ingest'], radon: ['w26_radon'] }, ru: { cosmic: ['ru20_cosmic'], terrestrial: ['ru20_terr'], internal: ['ru20_k40', 'ru20_food', 'ru20_water', 'ru20_air'], radon: ['ru20_radon'] } };
const sumRec = (ids) => ids.reduce((a, id) => a + rec(id).value, 0);

test('FR-101: сектора по возрастанию дозы, цвет закреплён за источником', () => {
  for (const r of REGIONS) {
    const cmp = cmpOf(r);
    const ds = buildDoseSlices(cmp, null, {});
    assert.equal(ds.slices.length, r === 'ru' ? 10 : 9, 'мир — 9 секторов; Россия — ещё и техногенное (#FR-101 v41)');
    for (let i = 1; i < ds.slices.length; i++) {
      assert.ok(ds.slices[i].doseSv >= ds.slices[i - 1].doseSv, 'дозы должны быть неубывающими');
    }
    const cis = new Set(ds.slices.map(s => s.ci));
    assert.equal(cis.size, ds.slices.length, 'цвета должны быть уникальными');
    for (const s of ds.slices) {
      assert.equal(s.ci, SLICE_COLOR[s.id], 'цвет должен соответствовать источнику');
      assert.ok(closeTo(s.riskP, s.doseSv * cmp.riskCoeff, 1e-12), 'риск должен совпадать');
    }
    const sumShares = ds.slices.reduce((a, s) => a + s.share, 0);
    assert.ok(closeTo(sumShares, 1, 1e-12), 'сумма долей должна быть 1');
  }
});

test('FR-101: природные сектора = записи данных региона × горизонт', () => {
  for (const r of REGIONS) {
    const cmp = cmpOf(r);
    const H = cmp.horizonYears;
    const ds = buildDoseSlices(cmp, null, {});
    const cosmic = byId(ds, 'cosmic');
    const terr = byId(ds, 'terrestrial');
    const internal = byId(ds, 'internal');
    const radon = byId(ds, 'radon');
    assert.ok(closeTo(cosmic.doseSv, sumRec(IDS[r].cosmic) * 1e-3 * H), 'космический фон');
    assert.ok(closeTo(terr.doseSv, sumRec(IDS[r].terrestrial) * 1e-3 * H), 'приземный фон');
    assert.ok(closeTo(internal.doseSv, sumRec(IDS[r].internal) * 1e-3 * H), 'внутренний фон');
    assert.ok(closeTo(radon.doseSv, sumRec(IDS[r].radon) * 1e-3 * H), 'радон по умолчанию');
    const ds2 = buildDoseSlices(cmp, 0.0123, {});
    const radon2 = byId(ds2, 'radon');
    assert.equal(radon2.doseSv, 0.0123, 'радон по дозиметру');
    assert.ok(radon2.label.includes('Радон в жилище'), 'подпись радона');
  }
});

test('FR-101: сумма составляющих фона сходится с опубликованным итогом региона', () => {
  for (const r of REGIONS) {
    const cmp = cmpOf(r);
    const ds = buildDoseSlices(cmp, null, {});
    const gap = Math.abs(ds.naturalSumMsv - ds.naturalTotalMsv);
    assert.ok(gap <= 0.01, 'разница между суммой и итогом должна быть <= 0.01');
    if (r === 'world') {
      assert.equal(ds.naturalTotalMsv, 3.0, 'итог для мира');
    } else if (r === 'ru') {
      assert.equal(ds.naturalTotalMsv, 3.36, 'итог для России');
    }
  }
});

test('FR-101: фон жилища по дозиметру заменяет, а не прибавляется', () => {
  for (const r of REGIONS) {
    const cmp = cmpOf(r);
    const H = cmp.horizonYears;
    const U = 0.12;
    const sv = homeDwellingDoseSv(cmp, U);
    const expected = U * 1e-6 * cmp.dwell.hours * cmp.dwell.h10ToE * H;
    assert.ok(closeTo(sv, expected), 'расчёт дозы жилища');
    const ds = buildDoseSlices(cmp, null, { dwellingSv: sv, dwellU: U });
    const terr = byId(ds, 'terrestrial');
    const bgTerr = sumRec(IDS[r].terrestrial) * 1e-3 * H;
    assert.ok(closeTo(terr.doseSv, (cmp.parts.terrOutdoorMsv ?? 0) * 1e-3 * H + sv), 'приземный фон с жилищем');
    assert.ok(terr.doseSv < bgTerr + sv, 'фон жилища заменяет, а не прибавляется');
    assert.ok(terr.label.includes('по показанию дозиметра'), 'подпись с дозиметром');
    const dsNoDw = buildDoseSlices(cmp, null, {});
    const terrNoDw = byId(dsNoDw, 'terrestrial');
    assert.ok(terrNoDw.label.includes('среднее'), 'подпись без дозиметра');
    assert.equal(homeDwellingDoseSv(cmp, 0), null, 'ноль даёт null');
    assert.equal(homeDwellingDoseSv(cmp, 101), null, 'больше 100 даёт null');
  }
});

test('FR-101: перелёты — частота меняет только свой сектор, ноль его убирает', () => {
  for (const r of REGIONS) {
    const cmp = cmpOf(r);
    const base = buildDoseSlices(cmp, null, {});
    const baseFlights = byId(base, 'flights');
    const ds4 = buildDoseSlices(cmp, null, { flightN: 4 });
    const flights4 = byId(ds4, 'flights');
    assert.ok(closeTo(flights4.doseSv, 2 * baseFlights.doseSv), 'перелёты удваиваются');
    for (const s of base.slices) {
      if (s.id !== 'flights') {
        const s4 = byId(ds4, s.id);
        assert.ok(closeTo(s4.doseSv, s.doseSv), 'остальные сектора не меняются');
      }
    }
    const ds0 = buildDoseSlices(cmp, null, { flightN: 0 });
    assert.equal(byId(ds0, 'flights'), undefined, 'ноль убирает перелёты');
    assert.ok(baseFlights.label.includes('по умолчанию'), 'подпись по умолчанию');
    const dsCustom = buildDoseSlices(cmp, null, { flightN: 4, flightDefault: false });
    const flightsCustom = byId(dsCustom, 'flights');
    assert.ok(flightsCustom.label.includes('введено пользователем'), 'подпись по вводу');
  }
});

test('FR-101: нет записи о медицине — сектора медицины нет, остальные на месте', () => {
  const data2 = { ...data, compare: data.compare.filter(r => r.role !== 'medicine') };
  const cmp = computeScenario(data2, scen('world')).comparison;
  const ds = buildDoseSlices(cmp, null, {});
  assert.equal(byId(ds, 'med_ct'), undefined, 'нет КТ');
  assert.equal(byId(ds, 'med_rad'), undefined, 'нет радиотерапии');
  assert.equal(byId(ds, 'med_other'), undefined, 'нет другой медицины');
  assert.ok(byId(ds, 'cosmic'), 'космический фон на месте');
  assert.ok(byId(ds, 'terrestrial'), 'приземный фон на месте');
  assert.ok(byId(ds, 'internal'), 'внутренний фон на месте');
  assert.ok(byId(ds, 'radon'), 'радон на месте');
  assert.ok(byId(ds, 'flights'), 'перелёты на месте');
  assert.ok(byId(ds, 'product'), 'продукт на месте');
  assert.equal(ds.medicine, null, 'медицина null');
  assert.equal(ds.medicineBad, false, 'медицина не ошибочна');
});

test('FR-101: нет составляющей природного фона — диаграммы нет', () => {
  const data3 = { ...data, compare: data.compare.filter(r => r.id !== 'w26_cosmic') };
  const cmp = computeScenario(data3, scen('world')).comparison;
  assert.equal(cmp, null, 'сравнение null');
  assert.equal(buildDoseSlices(null, null, {}), null, 'диаграмма null');
});

test('FR-101: подпись КТ называет, что доли грудной клетки для региона нет (Россия) и что доза — средняя на одну КТ (мир)', () => {
  const cmpRu = cmpOf('ru');
  const dsRu = buildDoseSlices(cmpRu, null, {});
  const medRu = byId(dsRu, 'med_ct');
  assert.ok(medRu.label.includes('все виды'), 'подпись КТ для России');
  assert.ok(medRu.label.includes('доля грудной клетки для региона не найдена'), 'примечание о доле');
  const cmpWorld = cmpOf('world');
  const dsWorld = buildDoseSlices(cmpWorld, null, {});
  const medWorld = byId(dsWorld, 'med_ct');
  assert.ok(medWorld.label.startsWith('Компьютерная томография грудной клетки'), 'подпись КТ для мира');
  assert.ok(medWorld.hint.includes('доза процедуры 7 мЗв'), 'подсказка для мира: доза КТ грудной клетки (#FR-102, та же, что на «Сравнении»)');
  assert.ok(!medWorld.hint.includes('средняя на одну КТ'), 'в мире доза не среднее по всем КТ (#FR-102)');
  assert.ok(!medRu.hint.includes('средняя на одну КТ'), 'подсказка для России');
});
