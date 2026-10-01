import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/calc/core.js';

function close(actual, expected, rel, msg) {
  const diff = Math.abs(actual - expected);
  const limit = rel * Math.abs(expected);
  assert.ok(diff <= limit, `${msg || ''} Expected ${expected}, got ${actual}`);
}

const dose = JSON.parse(readFileSync(new URL('../public/data/dose_coeff.json', import.meta.url), 'utf8'));

test('RadGear: поступление 9800 Бк/кг × 104,6 г = 1025,08 Бк', () => {
  close(C.intakeBq(9800, 0.1046), 1025.08, 1e-9);
});

test('TRS-472 разд. 11: поступление учитывает Fr (E = A·m·Fr·e) — 9800 Бк/кг × 104,6 г × Fr 0,5 = 512,54 Бк', () => {
  close(C.intakeBq(9800, 0.1046, 0.5), 512.54, 1e-9);
  close(C.annualIntakeBq({activityBqPerKg: 9800, portionKg: 0.1046, portionsPerYear: 20, fr: 0.5}), 10250.8, 1e-9);
});

test('RadGear: доза 1025 Бк × 1,3e-8 = 13,3 мкЗв', () => {
  close(C.committedDoseSv(C.intakeBq(9800, 0.1046), 1.3e-8), 13.3e-6, 0.005);
});

test('RadGear: риск за пакет ≈ 0,7 на млн (r = 5,5e-2)', () => {
  const d = C.committedDoseSv(C.intakeBq(9800, 0.1046), 1.3e-8);
  close(C.riskFromDose(d, 5.5e-2), 0.733e-6, 0.005);
});

test('RadGear: сезон 20 пакетов → 2,66e-4 Зв и 14,6 на млн', () => {
  const I = C.annualIntakeBq({activityBqPerKg: 9800, portionKg: 0.1046, portionsPerYear: 20});
  const E = C.committedDoseSv(I, 1.3e-8);
  close(E, 2.66e-4, 0.005);
  close(C.riskFromDose(E, 5.5e-2), 14.6e-6, 0.005);
});

test('НРБ-99/2009 Прил. 2: ПГП = 1 мЗв / e для всех 12 записей (±5 %, округление e до 2 знаков)', () => {
  const recs = dose.records.filter(r => r.source === 'NRB2009_App2');
  assert.equal(recs.length, 12);
  for (const r of recs) {
    close(C.pgpFromDose(1e-3, r.value), r.pgp_bq_per_year, 0.05, r.id);
  }
});

test('МУК 1194-03: ПГП Cs-137 7,7e4 Бк/год при 100 Бк/кг → 770 кг/год', () => {
  close(C.maxMassKg(77000, 100), 770, 1e-12);
});

test('maxMassKg: нулевая активность → Infinity', () => {
  assert.equal(C.maxMassKg(77000, 0), Infinity);
});

test('maxMassKg учитывает Fr', () => {
  close(C.maxMassKg(77000, 100, 0.5), 1540, 1e-12);
});

test('МУК п. 6.2: B + ΔB = 1 ровно → соответствует (≤, а не <)', () => {
  assert.equal(C.complianceB([{a: 50, da: 50, h: 100}]).verdict, C.VERDICT.CONFORMS);
});

test('МУК п. 6.3: B − ΔB = 1 ровно → не «не соответствует» (>, а не ≥)', () => {
  assert.equal(C.complianceB([{a: 150, da: 50, h: 100}]).verdict, C.VERDICT.UNDETERMINED);
});

test('МУК п. 6.3: B − ΔB > 1 → не соответствует', () => {
  assert.equal(C.complianceB([{a: 150, da: 40, h: 100}]).verdict, C.VERDICT.NONCONFORMS);
});

test('МУК п. 6.1: ΔB — квадратичная сумма (Cs 25±30 /100, Sr 8±16 /40 → B 0,45, ΔB 0,5, соответствует)', () => {
  const r = C.complianceB([{a: 25, da: 30, h: 100}, {a: 8, da: 16, h: 40}]);
  close(r.B, 0.45, 1e-12);
  close(r.dB, 0.5, 1e-12);
  assert.equal(r.verdict, C.VERDICT.CONFORMS);
});

test('МУК п. 6.5: точность ΔB ≤ 0,3', () => {
  assert.equal(C.complianceB([{a: 10, da: 30, h: 100}]).precisionOk, true);
  assert.equal(C.complianceB([{a: 10, da: 31, h: 100}]).precisionOk, false);
});

test('Распад: через один период полураспада — 0,5', () => {
  close(C.decayFactor(30.05, 30.05), 0.5, 1e-12);
  close(C.decayFactor(30.05, -30.05), 2, 1e-12);
});

test('decayCorrect: даты, 2 периода по 10 сут → ¼', () => {
  close(C.decayCorrect(400, 10, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-21T00:00:00Z')), 100, 1e-12);
});

test('TRS-472 ф. 51: Pf = Fr/Pe; сушка Fr 1, Pe 0,1 → Pf 10', () => {
  close(C.pfFromFrPe(1, 0.1), 10, 1e-12);
  close(C.dishActivity(9800, 0.4), 3920, 1e-12);
});

test('Почва: 1 кБк/м² в слое 0,2 м при ρ 500 кг/м³ → 10 Бк/кг', () => {
  close(C.soilActivityBqPerKg(1, 500, 0.2), 10, 1e-12);
  close(C.productFromSoil(10, 0.05), 0.5, 1e-12);
});

test('Tag: 15 Ки/км² = 555 кБк/м² × 0,005 м²/кг → 2775 Бк/кг', () => {
  close(C.productFromDeposition(555, 0.005), 2775, 1e-12);
});

test('Сухая → сырая масса: 1000 Бк/кг сух. при 10 % сухого вещества → 100', () => {
  close(C.dryToFresh(1000, 10), 100, 1e-12);
});

test('Fm/Ff: 1000 Бк/сут × 0,005 сут/л → 5 Бк/л', () => {
  close(C.animalProductBqPerKg(1000, 0.005), 5, 1e-12);
});

test('Мощность дозы → плотность: (129,19 − 100) / 2,919 = 10 кБк/м²; ниже фона → 0', () => {
  close(C.depositionFromDoseRate(129.19, 100, 2.919), 10, 1e-9);
  assert.equal(C.depositionFromDoseRate(90, 100, 2.919), 0);
});

test('Отказы: потерянный минус e = 1,3e+8 → RangeError', () => {
  assert.throws(() => C.committedDoseSv(1000, 1.3e8), RangeError);
});

test('Отказы: Fr > 1 → RangeError', () => {
  assert.throws(() => C.intakeBq(100, 1, 1.5), RangeError);
});

test('Отказы: NaN, отрицательная масса, пустой список B, h = 0, Pe = 0, неверная дата', () => {
  assert.throws(() => C.intakeBq(NaN, 1), RangeError);
  assert.throws(() => C.intakeBq(100, -1), RangeError);
  assert.throws(() => C.complianceB([]), RangeError);
  assert.throws(() => C.complianceB([{a: 1, da: 0, h: 0}]), RangeError);
  assert.throws(() => C.pfFromFrPe(1, 0), RangeError);
  assert.throws(() => C.decayCorrect(1, 10, new Date('x'), new Date()), RangeError);
  assert.throws(() => C.decayFactor(10, NaN), RangeError);
});

test('Отказы: коэффициент риска ≥ 1 и отрицательная доза', () => {
  assert.throws(() => C.riskFromDose(1e-3, 5.5), RangeError);
  assert.throws(() => C.riskFromDose(-1e-3, 5.5e-2), RangeError);
});
