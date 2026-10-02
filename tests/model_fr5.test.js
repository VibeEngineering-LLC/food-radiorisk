import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
function close(actual, expected, rel, msg) { assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), `${msg || ''} expected ${expected}, got ${actual}`); }
const nuc = (extra = {}) => ({ nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: null, depositionKBqPerM2: null, depositionDate: null, transferId: null, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 }, ...extra });
const base = (over = {}) => ({ age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.055, portionKg: 0.1, portionsPerYear: 10, years: 1, eatDate: null, dryMatterPercent: null, product: { name: 'черника', state: 'fresh' }, processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' }, foodGroupCode: null, nuclides: [nuc()], ...over });
const A2 = 'perevolotsky2006_t57_kp_cs137_bilberry_A2';
const PORCINI_DRY = 'perevolotsky2006_t51_kp_cs137_porcini_dry';

test("проба: активность делится на K", () => {
  const r = computeScenario(data, base({ nuclides: [nuc({ measuredBqPerKg: 7000, samplePrep: { mode: 'dried', concentrationFactor: 100 / 15 } })] }));
  assert.ok(r.ok === true);
  close(r.rows[0].rawBqPerKg, 1050, 1e-12);
  const prov = r.rows[0].provenance.find(p => p.step === 'проба');
  assert.ok(prov !== undefined, "Provenance entry with step 'проба' not found");
  close(prov.value, 100 / 15, 1e-12);
});

test("проба: K = 1 — шага «проба» нет", () => {
  const r = computeScenario(data, base());
  assert.ok(r.ok === true);
  assert.strictEqual(r.rows[0].rawBqPerKg, 1000);
  assert.ok(!r.rows[0].provenance.some(p => p.step === 'проба'), "Provenance entry with step 'проба' should not exist");
});

test("проба: K = 0 — ошибка", () => {
  const r = computeScenario(data, base({ nuclides: [nuc({ samplePrep: { mode: 'ashed', concentrationFactor: 0 } })] }));
  assert.ok(r.ok === false);
});

test("оценка загрязнения: D = A / (1000·КП), диапазон", () => {
  const r = computeScenario(data, base({ nuclides: [nuc({ transferId: A2 })] }));
  assert.ok(r.ok === true);
  const e = r.rows[0].depositionEstimate;
  assert.strictEqual(e.transferId, A2);
  close(e.kBqPerM2.central, 1000 / 3.11, 1e-9);
  close(e.kBqPerM2.min, 1000 / 3.5, 1e-9);
  close(e.kBqPerM2.max, 1000 / 2.9, 1e-9);
  close(e.ciPerKm2.central, 1000 / 3.11 / 37, 1e-9);
  const prov = r.rows[0].provenance.find(p => p.step === 'оценка загрязнения' && p.id === A2);
  assert.ok(prov !== undefined, "Provenance entry with step 'оценка загрязнения' and id A2 not found");
});

test("оценка загрязнения не меняет дозу", () => {
  const r1 = computeScenario(data, base());
  const r2 = computeScenario(data, base({ nuclides: [nuc({ transferId: A2 })] }));
  assert.ok(r1.ok === true);
  assert.ok(r2.ok === true);
  assert.strictEqual(r2.rows[0].doseSvPerYear, r1.rows[0].doseSvPerYear);
  assert.strictEqual(r2.rows[0].rawBqPerKg, r1.rows[0].rawBqPerKg);
  assert.strictEqual(r1.rows[0].depositionEstimate, null);
});

test("оценка загрязнения по высушенной пробе — по активности продукта", () => {
  const r = computeScenario(data, base({ nuclides: [nuc({ measuredBqPerKg: 7000, transferId: A2, samplePrep: { mode: 'dried', concentrationFactor: 100 / 15 } })] }));
  assert.ok(r.ok === true);
  close(r.rows[0].depositionEstimate.kBqPerM2.central, 1050 / 3.11, 1e-9);
});

test("оценка загрязнения: сушёный продукт, КП на сырую массу", () => {
  // #FR-34: 3110 Бк/кг сушёной / усушка 5 = 622 Бк/кг свежей; КП A2 3,11·10⁻³ → D = 622 / 3,11 = 200 кБк/м²
  const r = computeScenario(data, base({ dryMatterPercent: 15, dryingFactor: 5, product: { name: 'черника', state: 'dried' }, nuclides: [nuc({ measuredBqPerKg: 3110, transferId: A2 })] }));
  assert.ok(r.ok === true);
  close(r.rows[0].depositionEstimate.kBqPerM2.central, 200, 1e-9);
});

test("оценка загрязнения: КП на сухую массу", () => {
  const r = computeScenario(data, base({ dryMatterPercent: 10, product: { name: 'белый гриб', state: 'fresh' }, nuclides: [nuc({ transferId: PORCINI_DRY })] }));
  assert.ok(r.ok === true);
  close(r.rows[0].depositionEstimate.kBqPerM2.central, 10000 / 188, 1e-9);
  const warning = r.warnings.find(w => w.includes('оценка загрязнения'));
  assert.ok(warning !== undefined, "Warning including 'оценка загрязнения' not found");
});

test("оценка загрязнения без % сухого вещества — предупреждение, расчёт дозы идёт", () => {
  const r = computeScenario(data, base({ product: { name: 'белый гриб', state: 'fresh' }, nuclides: [nuc({ transferId: PORCINI_DRY })] }));
  assert.ok(r.ok === true);
  assert.strictEqual(r.rows[0].depositionEstimate, null);
  const warning = r.warnings.find(w => w.includes('оценка загрязнения не выполнена'));
  assert.ok(warning !== undefined, "Warning including 'оценка загрязнения не выполнена' not found");
  assert.ok(r.rows[0].doseSvPerYear > 0);
});

test("оценка загрязнения: неизвестная запись — предупреждение", () => {
  const r = computeScenario(data, base({ nuclides: [nuc({ transferId: 'no_such_id' })] }));
  assert.ok(r.ok === true);
  assert.strictEqual(r.rows[0].depositionEstimate, null);
  const warning = r.warnings.find(w => w.includes('no_such_id'));
  assert.ok(warning !== undefined, "Warning including 'no_such_id' not found");
});

test("зарубежные нормы: для ягод — только общие категории", () => {
  const r = computeScenario(data, base({ foodGroupCode: 'berries_wild' }));
  assert.ok(r.ok === true);
  assert.ok(r.limits.foreign.length > 0);
  const forbiddenPattern = /Детск|Молоч|Молоко|Жидкие|Малозначим|Питьев/;
  const hasForbidden = r.limits.foreign.some(l => forbiddenPattern.test(l.food_category_ru));
  assert.ok(!hasForbidden, "Found entry with forbidden food category");
  const japanEntry = r.limits.foreign.find(l => l.jurisdiction === 'Japan' && l.value === 100);
  assert.ok(japanEntry !== undefined, "No Japan entry with value 100 found");
  assert.deepStrictEqual(r.limits.foreignClasses, ['general']);
});

test("зарубежные нормы: детское питание — только детские категории", () => {
  const r = computeScenario(data, base({ foodGroupCode: 'baby_food' }));
  assert.ok(r.ok === true);
  const japan50 = r.limits.foreign.find(l => l.jurisdiction === 'Japan' && l.value === 50);
  assert.ok(japan50 !== undefined, "No Japan entry with value 50 found");
  const japan100 = r.limits.foreign.find(l => l.jurisdiction === 'Japan' && l.value === 100);
  assert.ok(japan100 === undefined, "Found Japan entry with value 100");
  const babyPattern = /Детск|младен/i;
  const allMatch = r.limits.foreign.every(l => babyPattern.test(l.food_category_ru));
  assert.ok(allMatch, "Not all entries match baby food pattern");
});

test("зарубежные нормы: без группы — общие категории", () => {
  const r = computeScenario(data, base({ foodGroupCode: null }));
  assert.ok(r.ok === true);
  assert.ok(r.limits.foreign.length > 0);
  const hasBabyFood = r.limits.foreign.some(l => l.food_category_ru.startsWith("Детское питание"));
  assert.ok(!hasBabyFood, "Found entry starting with 'Детское питание'");
});

test("проба высушена, K не задан (нет % сухого вещества) — ошибка, не молчаливое K = 1", () => {
  const r = computeScenario(data, base({ nuclides: [nuc({ samplePrep: { mode: 'dried', concentrationFactor: null } })] }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('K не задан')));
});

// #FR-60: аварийные уровни показываются с пометкой; здесь — сопоставление по нуклиду проверяется на действующих нормах
test("зарубежные нормы: по нуклиду, не по элементу (EU 2020/1158 только Cs-137; Япония Cs-134 + Cs-137)", () => {
  const cs134 = computeScenario(data, base({ nuclides: [nuc({ nuclide: 'Cs-134' })] }));
  assert.ok(!cs134.limits.foreign.some(l => /2020\/1158/.test(l.document)), 'EU 2020/1158 (только Cs-137) у Cs-134');
  assert.ok(cs134.limits.foreign.some(l => l.jurisdiction === 'Japan' && l.value === 100));
  const cs = computeScenario(data, base());
  assert.ok(cs.limits.foreign.some(l => l.jurisdiction === 'EU' && l.value === 600));
});
