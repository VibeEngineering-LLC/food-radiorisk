import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KBQ_PER_M2_PER_CI_PER_KM2,
  productFromSample,
  concentrationFactorFromDryMatter,
  toTransferBasis,
  depositionFromProduct,
  depositionRange,
  toCiPerKm2,
  depositionEstimate
} from '../src/calc/sample.js';

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test("K: активность пробы делится на коэффициент концентрирования", () => {
  assert.strictEqual(productFromSample(500, 5), 100);
});

test("K: неположительный K — ошибка", () => {
  assert.throws(() => productFromSample(500, 0), RangeError);
  assert.throws(() => productFromSample(500, -2), RangeError);
  assert.throws(() => productFromSample(-1, 5), RangeError);
});

test("K из сухого вещества", () => {
  close(concentrationFactorFromDryMatter(15), 100 / 15);
  assert.throws(() => concentrationFactorFromDryMatter(0), RangeError);
  assert.throws(() => concentrationFactorFromDryMatter(101), RangeError);
});

test("основа: свежий -> сухая масса", () => {
  close(toTransferBasis(100, "fresh", "dry", 15), 666.6666666666666);
});

// #FR-34: сушёный → свежий делением на коэффициент концентрирования при сушке (не через % сухого вещества)
test("основа: сушёный -> сырая масса через коэффициент концентрирования при сушке", () => {
  close(toTransferBasis(100, "dried", "fresh", 15, 5), 20);
});

test("основа: сушёный -> сухая масса — через свежий продукт", () => {
  close(toTransferBasis(100, "dried", "dry", 15, 5), 100 / 5 * 100 / 15);
});

test("основа: свежий на сырую — ни % сухого, ни коэффициент концентрирования при сушке не нужны", () => {
  assert.strictEqual(toTransferBasis(100, "fresh", "fresh", null, null), 100);
});

test("основа: сушёный без коэффициента концентрирования при сушке и неизвестная основа — ошибка", () => {
  assert.throws(() => toTransferBasis(100, "dried", "fresh", 15, null), RangeError);
  assert.throws(() => toTransferBasis(100, "fresh", null, null), RangeError);
  assert.throws(() => toTransferBasis(100, "fresh", null, 15), RangeError); // основа не задана — отказ, даже когда % сухого есть
});

test("основа: пересчёт без % сухого вещества — ошибка", () => {
  assert.throws(() => toTransferBasis(100, "fresh", "dry", null), RangeError);
});

test("основа: неизвестное состояние — ошибка", () => {
  assert.throws(() => toTransferBasis(100, "frozen", "fresh", 15), RangeError);
});

test("обратный пересчёт D = A / (1000 c)", () => {
  close(depositionFromProduct(1560, 0.0156), 100);
  assert.throws(() => depositionFromProduct(1560, 0), RangeError);
});

test("диапазон D: min от max коэффициента, max от min", () => {
  const res = depositionRange(1560, { central: 0.0156, min: 0.0078, max: 0.0312 });
  close(res.central, 100);
  close(res.min, 50);
  close(res.max, 200);
  assert.strictEqual(res.unbounded, false);
});

test("диапазон D: нулевой min коэффициента — верх не ограничен", () => {
  const res = depositionRange(1560, { central: null, min: 0, max: 0.0312 });
  assert.strictEqual(res.central, null);
  assert.strictEqual(res.max, null);
  assert.strictEqual(res.unbounded, true);
  close(res.min, 50);
});

test("Ки/км²", () => {
  close(toCiPerKm2(370), 10);
  assert.strictEqual(toCiPerKm2(null), null);
  assert.strictEqual(KBQ_PER_M2_PER_CI_PER_KM2, 37);
});

test("оценка по записи КП (сырая масса)", () => {
  const rec = {
    id: "kp1",
    quantity: "KP",
    unit_norm: "m2/kg",
    unit_factor: 1e-3,
    am: 15.6,
    gm: null,
    min: 7.8,
    max: 31.2,
    mass_basis: "fresh"
  };
  const res = depositionEstimate(1560, rec, "fresh", null);
  assert.strictEqual(res.transferId, "kp1");
  close(res.kBqPerM2.central, 100);
  close(res.kBqPerM2.min, 50);
  close(res.kBqPerM2.max, 200);
  close(res.ciPerKm2.central, 100 / 37);
  close(res.coeffM2PerKg.central, 0.0156);
});

test("оценка: среднее геометрическое, если нет арифметического", () => {
  const rec = {
    id: "kp1",
    quantity: "KP",
    unit_norm: "m2/kg",
    unit_factor: 1e-3,
    am: null,
    gm: 15.6,
    min: 7.8,
    max: 31.2,
    mass_basis: "fresh"
  };
  const res = depositionEstimate(1560, rec, "fresh", null);
  close(res.kBqPerM2.central, 100);
});

test("оценка: коэффициент на сухую массу", () => {
  const rec = {
    id: "kp1",
    quantity: "KP",
    unit_norm: "m2/kg",
    unit_factor: 1e-3,
    am: 15.6,
    gm: null,
    min: null,
    max: null,
    mass_basis: "dry"
  };
  const res = depositionEstimate(1560, rec, "fresh", 10);
  close(res.activityOnBasis, 15600);
  close(res.kBqPerM2.central, 1000);
  assert.strictEqual(res.kBqPerM2.min, null);
  assert.strictEqual(res.kBqPerM2.max, null);
});

test("оценка: единица не установлена — ошибка", () => {
  const rec = {
    id: "kp1",
    quantity: "KP",
    unit_norm: "Bq/kg per Bq/m2",
    unit_factor: 1e-3,
    am: 15.6,
    gm: null,
    min: 7.8,
    max: 31.2,
    mass_basis: "fresh"
  };
  assert.throws(() => depositionEstimate(1560, rec, "fresh", null), RangeError);
});

test("оценка: нет ни одного значения — ошибка", () => {
  const rec = {
    id: "kp1",
    quantity: "KP",
    unit_norm: "m2/kg",
    unit_factor: 1e-3,
    am: null,
    gm: null,
    min: null,
    max: null,
    mass_basis: "fresh"
  };
  assert.throws(() => depositionEstimate(1560, rec, "fresh", null), RangeError);
});
