import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
function close(actual, expected, rel, msg) { assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), `${msg || ''} expected ${expected}, got ${actual}`); }
const nuc = (nuclide, extra = {}) => ({ nuclide, source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: null, depositionKBqPerM2: null, depositionDate: null, transferId: null, variant: 'central', ...extra });
const base = (over = {}) => ({ age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 10, years: 3, eatDate: null, dryMatterPercent: null, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides: [nuc('Cs-137')], ...over });

test('Предел с пустым значением (Sr-90 грибы свежие) не участвует в сравнении и не даёт NaN', () => {
  const r = computeScenario(data, base({ foodGroupCode: 'mushrooms_fresh', nuclides: [nuc('Cs-137'), nuc('Sr-90')] }));
  assert.ok(r.ok);
  const csEntry = r.limits.ru.find(e => e.nuclide === 'Cs-137');
  assert.ok(csEntry, 'Cs-137 entry missing');
  assert.equal(csEntry.H, 500);
  assert.ok(Number.isFinite(csEntry.ratio));
  const srEntry = r.limits.ru.find(e => e.nuclide === 'Sr-90');
  assert.ok(srEntry, 'Sr-90 entry missing');
  assert.equal(srEntry.limitId, null);
  // #FR-32: прочерк в ТР ТС 021/2011 прил. 4 — «не нормируется», без предупреждения о пробеле
  assert.equal(srEntry.notNormed, true);
  assert.ok(!r.warnings.some(w => w.includes('нет предела')));
  assert.ok(r.limits.compliance !== null);
  assert.ok(Number.isFinite(r.limits.compliance.B));
  assert.ok(Number.isFinite(r.limits.compliance.dB));
  close(r.limits.compliance.B, 1000 / 500, 1e-12);
});

test('Единица коэффициента должна быть m²/кг: Fv (Бк/кг)/(Бк/кг) как Tag отклоняется', () => {
  const rec = data.transfer.find(r => r.quantity === 'Fv' && r.unit_norm !== 'm2/kg');
  assert.ok(rec, 'No Fv record with wrong unit found');
  const r = computeScenario(data, base({ nuclides: [nuc('Cs-137', { source: 'deposition', measuredBqPerKg: null, depositionKBqPerM2: 10, transferId: rec.id })] }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(' ').includes('единиц'));
});

test('Без выбранной группы норм сравнения с нормами РФ нет', () => {
  const r = computeScenario(data, base({ foodGroupCode: null }));
  assert.ok(r.ok);
  assert.equal(r.limits.ru.length, 0);
  assert.equal(r.limits.compliance, null);
});

test('Выбор источника e(g): возраст 1–2 года есть в НРБ-99/2009, но нет в ICRP 119; для взрослого значения совпадают', () => {
  const nrb = computeScenario(data, base({ age: '1-2y', doseSource: 'NRB2009_App2', nuclides: [nuc('Pb-210')] }));
  const icrp = computeScenario(data, base({ age: '1-2y', doseSource: 'ICRP119_F1', nuclides: [nuc('Pb-210')] }));
  assert.ok(nrb.ok, nrb.errors.join('; '));
  assert.equal(icrp.ok, false);
  assert.ok(icrp.errors.join(' ').includes('Pb-210'));
  const a = computeScenario(data, base({ nuclides: [nuc('Cs-137')], doseSource: 'ICRP119_F1' }));
  const b = computeScenario(data, base({ nuclides: [nuc('Cs-137')], doseSource: 'NRB2009_App2' }));
  assert.equal(a.rows[0].eSvPerBq, b.rows[0].eSvPerBq); // D-008: 23 пары НРБ ↔ ICRP 119 без расхождений
  assert.equal(a.rows[0].provenance.find(p => p.step === 'доза').source, 'ICRP119_F1');
  assert.ok(b.rows[0].provenance.find(p => p.step === 'доза').source.startsWith('NRB2009'));
});

test('Поступление за период = поступление за год × лет', () => {
  const r = computeScenario(data, base());
  const rows = r.rows;
  close(rows[0].intakeBqPerYear, 1000 * 0.1 * 10, 1e-12);
  close(rows[0].intakeBqTotal, 1000 * 0.1 * 10 * 3, 1e-12);
});

// #FR-33/#FR-44: основа массы у КП обязательна; выведенная косвенно — только обоснование в провенансе (без жёлтого предупреждения); принятая — предупреждение
test('Основа массы КП принята без опоры на текст — предупреждение простыми словами', () => {
  const rec = data.transfer.find(r => r.mass_basis_status === 'assumed' && r.nuclide === 'Cs-137' && (Number.isFinite(r.am) || Number.isFinite(r.gm)) && r.mass_basis === 'fresh');
  assert.ok(rec, 'No transfer record with assumed mass basis found');
  const r = computeScenario(data, base({ nuclides: [nuc('Cs-137', { source: 'deposition', measuredBqPerKg: null, depositionKBqPerM2: 10, transferId: rec.id })] }));
  assert.ok(r.ok);
  assert.ok(r.warnings.some(w => w.includes('без опоры на текст источника')));
});
test('Основа массы КП выведена косвенно — обоснование в провенансе, предупреждения нет', () => {
  const rec = data.transfer.find(r => r.mass_basis_status === 'inferred' && r.mass_basis === 'fresh' && r.nuclide === 'Cs-137' && (Number.isFinite(r.am) || Number.isFinite(r.gm)));
  assert.ok(rec, 'No transfer record with inferred mass basis found');
  const r = computeScenario(data, base({ nuclides: [nuc('Cs-137', { source: 'deposition', measuredBqPerKg: null, depositionKBqPerM2: 10, transferId: rec.id })] }));
  assert.ok(r.ok);
  assert.ok(!r.warnings.some(w => w.includes('какую массу')));
  assert.ok(r.rows[0].provenance.some(p => p.note && p.note.includes('по методике автора') && p.note.includes(rec.mass_basis_note)));
});

test('У всех КП (Tag, KP) основа массы задана', () => {
  assert.deepEqual(data.transfer.filter(r => ['Tag', 'KP'].includes(r.quantity) && !['fresh', 'dry'].includes(r.mass_basis)).map(r => r.id), []);
});

test('Зарубежные нормы для цезия не содержат записей, где в списке нуклидов нет цезия', () => {
  const r = computeScenario(data, base({ nuclides: [nuc('Cs-137', { measuredBqPerKg: 9800 })], foodGroupCode: null }));
  assert.ok(r.limits.foreign.length > 0);
  for (const item of r.limits.foreign) {
    const f = data.limits_foreign.find(x => x.id === item.id);
    assert.ok(f, `Foreign limit ${item.id} not found in data`);
    // нуклид назван прямо («Cs-137») или в групповой записи ЕС («… notably Cs-134 and Cs-137»)
    assert.ok(f.nuclides.some(x => x === 'Cs' || x.includes('Cs-137')), `Limit ${item.id} does not cover Cs-137`);
  }
  const nonCs = data.limits_foreign.find(f => Number.isFinite(f.value) && f.unit === 'Bq/kg' && !f.nuclides.some(x => x.includes('Cs')));
  assert.ok(nonCs, 'No non-Cs foreign limit found to test exclusion');
  assert.ok(!r.limits.foreign.some(item => item.id === nonCs.id), 'Non-Cs limit leaked into results');
});
