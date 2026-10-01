// #FR-31: сводная оценка загрязнения — интервал по всем записям КП; непроверенные (не ✅) — не берутся
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const nuc = (extra) => ({ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 }, ...extra });
const run = (n) => computeScenario(data, { age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 10, years: 1, eatDate: null, dryMatterPercent: 15, product: { name: 'черника', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides: [nuc(n)] });
const kp = data.transfer.filter(r => r.nuclide === 'Cs-137' && /черник/i.test(r.item_ru) && ['Tag', 'KP'].includes(r.quantity));
const good = kp.filter(r => r.mass_basis != null && r.level === '✅' && !r.source_anomaly).map(r => r.id);
// не ✅ (в т. ч. с основой массы по выводу, #FR-33) — в сводную не входят
const noBasis = kp.find(r => r.level !== '✅').id;

// #FR-38: одна точка на запись (центр, иначе среднее геометрическое границ); сводная — медиана и [min, max] точек; 1986 не берётся
const pointOf = (k) => k.central ?? (k.min != null && k.max != null ? Math.sqrt(k.min * k.max) : (k.min ?? k.max));
const is1986 = (id) => /1986/.test(data.transfer.find(r => r.id === id).item_ru);

test('сводная: медиана и границы точечных оценок; 1986 и не ✅ — не берутся', () => {
  const kept = good.filter(id => !is1986(id));
  assert.ok(kept.length < good.length, 'в наборе черники должна быть запись 1986 года');
  const pts = kept.map(id => pointOf(run({ transferId: id }).rows[0].depositionEstimate.kBqPerM2)).sort((x, y) => x - y);
  const m = pts.length, med = m % 2 ? pts[(m - 1) / 2] : Math.sqrt(pts[m / 2 - 1] * pts[m / 2]);
  const e = run({ transferId: 'ALL', transferIds: [...good, noBasis] }).rows[0].depositionEstimate;
  // #FR-46: границы — квартили (логарифмическая интерполяция), полный разброс — в summary
  const quart = (p) => { const x = (m - 1) * p, i = Math.floor(x), a = pts[i], b = pts[Math.min(i + 1, m - 1)]; return a * Math.pow(b / a, x - i); };
  assert.deepEqual([e.kBqPerM2.central, e.summary.fullMin, e.summary.fullMax], [med, pts[0], pts[m - 1]]);
  assert.ok(Math.abs(e.kBqPerM2.min - quart(0.25)) < 1e-9 * quart(0.25) && Math.abs(e.kBqPerM2.max - quart(0.75)) < 1e-9 * quart(0.75));
  assert.ok(e.kBqPerM2.min > pts[0] && e.kBqPerM2.max < pts[m - 1], 'квартили уже полного разброса');
  assert.deepEqual([e.summary.used, e.summary.total], [kept.length, good.length + 1]);
});

test('квартили при дробной позиции (6 оценок): интерполяция по логарифму', () => {
  const ids = good.filter(id => !is1986(id)).slice(0, 6);
  const pts = ids.map(id => pointOf(run({ transferId: id }).rows[0].depositionEstimate.kBqPerM2)).sort((x, y) => x - y);
  const geo = (x) => { const i = Math.floor(x); return pts[i] * Math.pow(pts[i + 1] / pts[i], x - i); };
  const e = run({ transferId: 'ALL', transferIds: ids }).rows[0].depositionEstimate.kBqPerM2;
  assert.ok(Math.abs(e.min - geo(1.25)) < 1e-9 * e.min && Math.abs(e.max - geo(3.75)) < 1e-9 * e.max);
});

test('провенанс сводной: КП в м²/кг, как в одиночной оценке (с множителем единицы)', () => {
  const r = run({ transferId: 'ALL', transferIds: good }).rows[0];
  for (const p of r.provenance.filter(q => q.step === 'оценка загрязнения (сводная)')) {
    const c = run({ transferId: p.id }).rows[0].depositionEstimate.coeffM2PerKg;
    assert.equal(p.value, c.central ?? c.min ?? c.max, p.id);
  }
});

test('сводная по одной записи: точка — центр, а не границы; запись только с границами — среднее геометрическое', () => {
  const A2 = 'perevolotsky2006_t57_kp_cs137_bilberry_A2', k = run({ transferId: A2 }).rows[0].depositionEstimate.kBqPerM2;
  const e = run({ transferId: 'ALL', transferIds: [A2] }).rows[0].depositionEstimate.kBqPerM2;
  assert.ok(k.min < k.central && k.central < k.max);
  assert.deepEqual([e.min, e.central, e.max], [k.central, k.central, k.central]);
  const LT = 'perevolotsky2006_kp_cs137_bilberry_long_term', kl = run({ transferId: LT }).rows[0].depositionEstimate.kBqPerM2;
  assert.equal(kl.central, null);
  assert.equal(run({ transferId: 'ALL', transferIds: [LT] }).rows[0].depositionEstimate.kBqPerM2.central, Math.sqrt(kl.min * kl.max));
});
