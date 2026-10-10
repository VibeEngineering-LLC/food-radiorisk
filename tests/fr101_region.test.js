import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { DEFAULT_REGION, REGIONS, normRegion, recordsFor, regionLeak, CAPTION } from '../src/calc/region.js';
import { regionParts, regionDefaults } from '../src/calc/region_parts.js';
import { effectiveInputs } from '../src/calc/ext_inputs.js';
import { buildDoseSlices, medicineSplit } from '../src/calc/dose_sources.js';
import { homeRadonDoseSv, riskSlices } from '../src/calc/summary_charts.js';
import { buildBibliography, usedSourceIds } from '../src/ui/bibliography.js';
import { loadRegion, saveRegion, parseExt, REGION_KEY } from '../src/react/persist.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const scen = (region) => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1, region });
const withoutRegion = () => { const i = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 }); delete i.region; return i; };
const calc = (input) => computeScenario(data, input);
const html = (input, tab) => renderJsx('src/react/Result.jsx', 'default', { result: calc(input), input, meta: META, initialTab: tab });
const closeTo = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);
const e0Of = (lt) => {
  const one = (sex) => { const n = lt.nodes, l = lt.lx[sex]; let t = 0; for (let i = 0; i < n.length - 1; i++) t += (n[i + 1] - n[i]) * (l[i] + l[i + 1]) / 2; return (t + l[l.length - 1] * lt.ex_open[sex]) / l[0]; };
  const w = lt.births.male / (lt.births.male + lt.births.female);
  return w * one('male') + (1 - w) * one('female');
};
const ltOf = (region) => data.life_risks.find(r => r.kind === 'life_table' && r.region === region);

test('FR-101: режим по умолчанию — «Мир»', () => {
  assert.equal(DEFAULT_REGION, 'world');
  assert.deepEqual(REGIONS, ['world', 'ru']);
  assert.equal(normRegion(undefined), 'world');
  assert.equal(normRegion('xx'), 'world');
  assert.equal(normRegion('ru'), 'ru');
  const res = calc(withoutRegion());
  assert.equal(res.comparison.region, 'world');
  assert.equal(res.lifeRisks.region, 'world');
  const prev = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.equal(loadRegion(), 'world');
  } finally {
    if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev;
  }
});

test('FR-101: persist региона', () => {
  const prev = globalThis.localStorage;
  globalThis.localStorage = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } };
  try {
    saveRegion('ru');
    assert.equal(loadRegion(), 'ru');
    assert.equal(globalThis.localStorage._m[REGION_KEY], 'ru');
    saveRegion('mars');
    assert.equal(globalThis.localStorage._m[REGION_KEY], 'world');
    const e1 = parseExt('{"v":3,"radonC":77,"ctN":2,"xrayN":3,"flightN":1}');
    assert.equal(e1.radonC, 77);
    assert.equal(e1.ctN, 2);
    assert.equal(e1.xrayN, 3);
    assert.equal(e1.flightN, 1);
    assert.ok(Number.isNaN(e1.dwellU));
    const e2 = parseExt('{"v":2,"radonC":200,"dwellU":0.15,"xrayN":1,"flightN":2}');
    assert.ok(Number.isNaN(e2.radonC));
    assert.ok(Number.isNaN(e2.dwellU));
    assert.ok(Number.isNaN(e2.xrayN));
    assert.ok(Number.isNaN(e2.ctN));
    assert.equal(e2.flightN, 2);
  } finally {
    if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev;
  }
});

test('FR-101: в каждом режиме нет записей чужого региона', () => {
  for (const r of REGIONS) {
    const other = r === 'world' ? 'ru' : 'world';
    assert.deepEqual(regionLeak(recordsFor(data.compare, r), r), []);
    assert.deepEqual(regionLeak(recordsFor(data.life_risks, r), r), []);
    assert.ok(!recordsFor(data.compare, r).some(x => x.superseded === true));
    assert.ok(!recordsFor(data.life_risks, r).some(x => x.superseded === true));
    assert.ok(data.compare.some(x => x.region === other));
    assert.ok(data.life_risks.some(x => x.region === other));
  }
  const worldPrefixes = ['w26_', 'w21_', 'cs_w_', 'lt_world'];
  const ruPrefixes = ['ru20_', 'ru17_', 'ru_', 'lt_ru'];
  for (const rec of data.compare) {
    if (worldPrefixes.some(p => rec.id.startsWith(p))) assert.equal(rec.region, 'world');
    if (ruPrefixes.some(p => rec.id.startsWith(p))) assert.equal(rec.region, 'ru');
  }
  for (const rec of data.life_risks) {
    if (worldPrefixes.some(p => rec.id.startsWith(p))) assert.equal(rec.region, 'world');
    if (ruPrefixes.some(p => rec.id.startsWith(p))) assert.equal(rec.region, 'ru');
  }
});

test('FR-101: расчёт и экран режима «Мир» не содержат российских данных, режима «Россия» — мировых', async () => {
  const RU_ONLY = ['BARKOVSKY2021', 'ONISHCHENKO2019', 'ONISHCHENKO2017', 'ROSSTAT_DEMOG2023', 'WHO_MORTDB', 'HEI_SOGA2019', 'MR_2_6_1_0333_23', 'MU_2_6_1_037_2015'];
  const WORLD_ONLY = ['UNSCEAR2026_PR', 'UNSCEAR2020_A', 'MAHESH2023', 'UN_WPP2024', 'WHO_GHE2023', 'UNSCEAR2008', 'UNSCEAR2008_A'];
  const collectSources = (obj, out) => {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { for (const v of obj) collectSources(v, out); return; }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'source' && typeof v === 'string') out.add(v);
      else collectSources(v, out);
    }
  };
  for (const r of REGIONS) {
    const res = calc(scen(r));
    const sources = new Set();
    collectSources(res.comparison, sources);
    collectSources(res.lifeRisks, sources);
    const used = usedSourceIds(res);
    const bib = buildBibliography(res);
    const bibIds = new Set(bib.map(b => b.id));
    if (r === 'world') {
      for (const id of RU_ONLY) { assert.ok(!sources.has(id)); assert.ok(!used.has(id)); }
      assert.ok(bibIds.has('UN_WPP2024'));
      assert.ok(bibIds.has('WHO_GHE2023'));
    } else {
      for (const id of WORLD_ONLY) { assert.ok(!sources.has(id)); assert.ok(!used.has(id)); }
      assert.ok(bibIds.has('ROSSTAT_DEMOG2023'));
      assert.ok(bibIds.has('WHO_MORTDB'));
      assert.ok(bibIds.has('MR_2_6_1_0333_23'));
      assert.ok(bibIds.has('MU_2_6_1_037_2015'));
    }
    for (const tab of ['sum', 'cmp', 'life']) {
      const text = norm(await html(scen(r), tab));
      if (r === 'world') {
        assert.ok(!text.includes('Барковский'));
        assert.ok(!text.includes('Росстат'));
      } else {
        assert.ok(!text.includes('НКДАР ООН 2026'));
        assert.ok(!text.includes('WPP'));
      }
    }
  }
});

test('FR-101: экориски (HEI, Россия 2017) — только в режиме «Россия»', async () => {
  const w = calc(scen('world'));
  assert.equal(w.lifeRisks.lifetime.air, null);
  const ru = calc(scen('ru'));
  assert.ok(ru.lifeRisks.lifetime.air !== null);
  assert.equal(ru.lifeRisks.lifetime.air.region, 'ru');
  assert.ok(ru.lifeRisks.lifetime.air.groups.length > 0);
  const wText = norm(await html(scen('world'), 'sum'));
  const ruText = norm(await html(scen('ru'), 'sum'));
  assert.ok(!wText.includes('загрязнения воздуха'));
  assert.ok(ruText.includes('загрязнения воздуха'));
});

test('FR-101: таблица дожития мира — e0 = 72,61 ± 0,05; российская таблица краснеет', () => {
  const w = ltOf('world');
  assert.ok(Math.abs(e0Of(w) - 72.61) <= 0.05);
  const ru = { ...ltOf('ru'), ex_open: w.ex_open };
  assert.ok(Math.abs(e0Of(ru) - 72.61) > 0.05);
  assert.equal(w.source, 'UN_WPP2024');
  assert.equal(ltOf('ru').source, 'ROSSTAT_DEMOG2023');
  assert.equal(w.nodes.length, 22);
  assert.equal(w.nodes[w.nodes.length - 1], 100);
  const res = calc(scen('world'));
  assert.equal(res.lifeRisks.year, 2019);
  assert.equal(res.lifeRisks.region, 'world');
});

test('FR-101: медицина — три сектора делят одну среднюю дозу без двойного счёта', () => {
  for (const r of REGIONS) {
    const res = calc(scen(r));
    const cmp = res.comparison;
    const H = cmp.horizonYears;
    const ds = buildDoseSlices(cmp, homeRadonDoseSv(scen(r), cmp, 40), { radonC: 40, radonIsDefault: true });
    const ct = ds.slices.find(s => s.id === 'med_ct');
    const rad = ds.slices.find(s => s.id === 'med_rad');
    const other = ds.slices.find(s => s.id === 'med_other');
    assert.ok(ct && rad && other);
    assert.ok(closeTo(ct.doseSv + rad.doseSv + other.doseSv, cmp.parts.medicine.msv * 1e-3 * H));
    assert.ok(other.doseSv >= 0);
    if (r === 'world') assert.equal(cmp.parts.medicine.msv, 0.57);
    else assert.equal(cmp.parts.medicine.msv, 0.81);
    assert.equal(ds.medicineBad, false);
  }
});

test('FR-101: ввод N меняет только свой сектор', () => {
  for (const r of REGIONS) {
    const res = calc(scen(r));
    const cmp = res.comparison;
    const H = cmp.horizonYears;
    const base = buildDoseSlices(cmp, null, {});
    const ctCase = buildDoseSlices(cmp, null, { ctN: 5 });
    const xrayCase = buildDoseSlices(cmp, null, { xrayN: 7 });
    const get = (ds, id) => ds.slices.find(s => s.id === id);
    const bCt = get(base, 'med_ct'), bRad = get(base, 'med_rad'), bOther = get(base, 'med_other');
    const cCt = get(ctCase, 'med_ct'), cRad = get(ctCase, 'med_rad'), cOther = get(ctCase, 'med_other');
    assert.ok(closeTo(cCt.doseSv, 5 * cmp.parts.ct.doseProc * 1e-3 * H));
    assert.ok(closeTo(cRad.doseSv, bRad.doseSv));
    assert.ok(closeTo(cOther.doseSv, bOther.doseSv));
    const xCt = get(xrayCase, 'med_ct'), xRad = get(xrayCase, 'med_rad'), xOther = get(xrayCase, 'med_other');
    assert.ok(closeTo(xRad.doseSv, 7 * cmp.parts.rad.doseProc * 1e-3 * H));
    assert.ok(closeTo(xCt.doseSv, bCt.doseSv));
    assert.ok(closeTo(xOther.doseSv, bOther.doseSv));
    const zeroXray = buildDoseSlices(cmp, null, { xrayN: 0 });
    assert.ok(!zeroXray.slices.some(s => s.id === 'med_rad'));
    const zOther = get(zeroXray, 'med_other');
    assert.ok(closeTo(zOther.doseSv, bOther.doseSv));
  }
});

test('FR-101: «остальная» медицина не отрицательна — иначе громкая проверка', () => {
  const res = calc(scen('ru'));
  const cmp = res.comparison;
  const parts2 = { ...cmp.parts, medicine: { ...cmp.parts.medicine, msv: 0.1 } };
  const split = medicineSplit(parts2);
  assert.equal(split.bad, true);
  const ds = buildDoseSlices({ ...cmp, parts: parts2 }, null, {});
  assert.equal(ds.medicineBad, true);
  assert.ok(!ds.slices.some(s => s.id === 'med_ct'));
  assert.ok(!ds.slices.some(s => s.id === 'med_rad'));
  assert.ok(!ds.slices.some(s => s.id === 'med_other'));
  for (const r of REGIONS) {
    const c = calc(scen(r)).comparison;
    const s = medicineSplit(c.parts);
    assert.ok(s.otherMsv >= 0);
    assert.equal(s.bad, false);
  }
});

test('FR-101: умолчания полей зависят от региона, введённое пользователем сохраняется', () => {
  const pw = regionParts(recordsFor(data.compare, 'world'), 'world');
  const pr = regionParts(recordsFor(data.compare, 'ru'), 'ru');
  const dw = regionDefaults(pw);
  const dr = regionDefaults(pr);
  assert.equal(dw.radonC, 40);
  assert.ok(closeTo(dr.radonC, 28.1 / 0.5));
  assert.ok(closeTo(dr.radonC, 56.2));
  assert.equal(dw.dwellU, null);
  assert.equal(dr.dwellU, 0.11);
  assert.ok(closeTo(dw.ctN, 0.055 * 0.122));
  assert.ok(closeTo(dr.ctN, 0.0695));
  assert.ok(closeTo(dw.xrayN, 0.359));
  assert.ok(closeTo(dr.xrayN, 1.8131));
  const ew = effectiveInputs(pw, {});
  assert.equal(ew.radonC, 40);
  assert.equal(ew.radonIsDefault, true);
  assert.equal(ew.dwellU, null);
  const er = effectiveInputs(pr, {});
  assert.ok(closeTo(er.radonC, 56.2));
  const ext = { radonC: 123, dwellU: 0.2, ctN: 3, xrayN: 4 };
  const ew2 = effectiveInputs(pw, ext);
  const er2 = effectiveInputs(pr, ext);
  for (const e of [ew2, er2]) {
    assert.equal(e.radonC, 123);
    assert.equal(e.radonIsDefault, false);
    assert.equal(e.dwellU, 0.2);
    assert.equal(e.ctN, 3);
    assert.equal(e.ctIsDefault, false);
    assert.equal(e.xrayN, 4);
    assert.equal(e.xrayIsDefault, false);
    assert.equal(e.flightN, 2);
    assert.equal(e.flightIsDefault, true);
  }
  assert.equal(pr.radonEec.eec, 28.1);
  assert.equal(pr.radonEec.f, 0.5);
  assert.equal(pr.radonEec.fSource, 'MR_2_6_1_0333_23');
});

test('FR-101: переключатель региона на «Сводке», «Сравнении» и «Бытовых рисках»', async () => {
  for (const tab of ['sum', 'cmp', 'life']) {
    for (const r of REGIONS) {
      const h = await html(scen(r), tab);
      assert.ok(h.includes('data-region="world"'));
      assert.ok(h.includes('data-region="ru"'));
      const other = r === 'world' ? 'ru' : 'world';
      const reTrue = new RegExp('aria-pressed="true"[^>]*data-region="' + r + '"|data-region="' + r + '"[^>]*aria-pressed="true"');
      const reFalse = new RegExp('aria-pressed="false"[^>]*data-region="' + other + '"|data-region="' + other + '"[^>]*aria-pressed="false"');
      assert.ok(reTrue.test(h));
      assert.ok(reFalse.test(h));
      const text = norm(h);
      const caption = (tab === 'life') ? CAPTION[r].risk : CAPTION[r].dose;
      assert.ok(text.includes(caption));
    }
  }
});

test('FR-101: поля «Сравнения» — умолчания в подсказке поля, введённое в значении', async () => {
  const hw = await html(scen('world'), 'cmp');
  const hr = await html(scen('ru'), 'cmp');
  for (const id of ['ctN', 'xrayN', 'radonC', 'dwellU']) {
    assert.ok(hw.includes('id="' + id + '"'));
    assert.ok(hr.includes('id="' + id + '"'));
  }
  assert.ok(hw.includes('placeholder="40"'));
  assert.ok(hr.includes('placeholder="56.2"'));
  const hintMatch = hr.match(/id="cmpFieldsHint"[^]*?<\/p>/);
  assert.ok(hintMatch);
  const hint = norm(hintMatch[0]);
  assert.ok(hint.includes('28,1'));
  assert.ok(hint.includes('0,5'));
  assert.ok(hint.includes('МР 2.6.1.0333-23'));
});

test('FR-101: диаграмма (а) — подписи региона и год данных', async () => {
  for (const r of REGIONS) {
    const h = await html(scen(r), 'sum');
    const doseMatch = h.match(/data-chart="dose"[^]*?<\/figure>/);
    const riskMatch = h.match(/data-chart="risk"[^]*?<\/figure>/);
    assert.ok(doseMatch);
    assert.ok(riskMatch);
    const doseText = norm(doseMatch[0]);
    const riskText = norm(riskMatch[0]);
    assert.ok(doseText.includes(CAPTION[r].dose));
    assert.ok(riskText.includes(CAPTION[r].risk));
  }
});
