import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSpe, speDateToIso, parseMassPair, parseSpeHeader, productFromShifr, concentrationFromMasses, speToForm } from '../src/ui/spe.js';

const HEADER = [
  'PROGVERSION=1.7.13823', 'SHIFR=Сухое молоко Рогачев_1', 'NOMER=0', 'TYPE=Образец',
  'MEASBEGIN=11-07-25 15:51:44.38', 'PREPBEGIN=09-12-24 01:11:57.0', 'PREPEND=09-12-24 01:11:57.0',
  'TLIVE=10684.075', 'TREAL=10688.105', 'OPERATOR=', 'GEOMETRY=Маринелли', 'MATERIAL=not essential',
  'RAWMASS=1000.0;0.05', 'PROBEMASS=1000.0;0.05', 'SAMPLEMASS=670.9;0.05', 'COMMENT=',
  'CALC_NOT CONT CORRECT=-1', 'PEAKS=2',
  '226.682\t0.667 \t661.657\t3.685 \t45.766\t4.096\t814\t73\t0.882\t4\t1\tCs-137\t85.13\t0.19',
  'SPECTR=xx', 'SHIFR=ПОСЛЕ СПЕКТРА', 'TYPE=Фон'
].join('\r\n');

test("дата ДД-ММ-ГГ", () => {
  assert.strictEqual(speDateToIso("11-07-25 15:51:44.38"), "2025-07-11");
  assert.strictEqual(speDateToIso("31-10-25"), "2025-10-31");
  assert.strictEqual(speDateToIso("19-11-2025"), "2025-11-19");
});

test("неверная дата — null", () => {
  assert.strictEqual(speDateToIso("31-02-25"), null);
  assert.strictEqual(speDateToIso("12-13-25"), null);
  assert.strictEqual(speDateToIso(""), null);
  assert.strictEqual(speDateToIso(undefined), null);
});

test("масса со значением и погрешностью", () => {
  assert.deepStrictEqual(parseMassPair("1000.0;0.05"), { value: 1000, unc: 0.05 });
  assert.deepStrictEqual(parseMassPair("670,9;0,05"), { value: 670.9, unc: 0.05 });
  assert.deepStrictEqual(parseMassPair("670.9"), { value: 670.9, unc: null });
  assert.strictEqual(parseMassPair("0;0.05"), null);
  assert.strictEqual(parseMassPair(""), null);
});

test("заголовок: поля образца", () => {
  const h = parseSpeHeader(HEADER);
  assert.strictEqual(h.shifr, "Сухое молоко Рогачев_1");
  assert.strictEqual(h.type, "Образец");
  assert.strictEqual(h.geometry, "Маринелли");
  assert.strictEqual(h.measBegin, "2025-07-11");
  assert.strictEqual(h.tLive, 10684.075);
  assert.strictEqual(h.sampleMass.value, 670.9);
  assert.strictEqual(h.rawMass.value, 1000);
});

test("заголовок: после SPECTR= не читается", () => {
  const h = parseSpeHeader(HEADER);
  assert.strictEqual(h.raw.TYPE, "Образец");
  assert.strictEqual(h.raw.SHIFR, "Сухое молоко Рогачев_1");
});

test("заголовок: ключ с пробелом и строки пиков", () => {
  const h = parseSpeHeader(HEADER);
  assert.strictEqual(h.raw["CALC_NOT CONT CORRECT"], "-1");
  for (const key of Object.keys(h.raw)) {
    assert.ok(!key.includes("226.682"), `Key ${key} should not contain peak data`);
  }
});

test("заголовок: пустой текст не падает", () => {
  const h = parseSpeHeader("");
  assert.strictEqual(h.shifr, "");
  assert.strictEqual(h.rawMass, null);
  assert.strictEqual(h.measBegin, null);
});

test("название продукта из шифра", () => {
  assert.strictEqual(productFromShifr("Сухое молоко Рогачев_1"), "Сухое молоко Рогачев");
  assert.strictEqual(productFromShifr("Брусника_1_1"), "Брусника");
  assert.strictEqual(productFromShifr("Грунт Каменск-Уральск лес 0-10 см_1_1"), "Грунт Каменск-Уральск лес 0-10 см");
  assert.strictEqual(productFromShifr("Клубника луговая"), "Клубника луговая");
  assert.strictEqual(productFromShifr(""), "");
});

test("K по массам", () => {
  const k1 = concentrationFromMasses(1000, 150);
  assert.ok(Math.abs(k1 - 1000 / 150) < 1e-12);
  assert.strictEqual(concentrationFromMasses(1000, 1000), 1);
  assert.strictEqual(concentrationFromMasses(null, 150), null);
  assert.strictEqual(concentrationFromMasses(1000, 0), null);
});

test("в форму: образец", () => {
  const f = speToForm(parseSpeHeader(HEADER));
  assert.strictEqual(f.product, "Сухое молоко Рогачев");
  assert.strictEqual(f.rawMassG, 1000);
  assert.strictEqual(f.probeMassG, 1000);
  assert.strictEqual(f.sampleMassG, 670.9);
  assert.strictEqual(f.refDate, "2025-07-11");
  assert.strictEqual(f.k, 1);
  assert.strictEqual(f.warnings.length, 1);
  assert.ok(f.warnings[0].includes("активность"));
});

test("в форму: фон и без масс — предупреждения", () => {
  const f = speToForm(parseSpeHeader("SHIFR=Фон_1\nTYPE=Фон\nSPECTR="));
  assert.strictEqual(f.k, null);
  assert.strictEqual(f.warnings.length, 3);
  assert.ok(f.warnings[0].includes("Фон"));
  assert.ok(f.warnings[1].includes("K не определён"));
});

test("декодирование windows-1251", () => {
  assert.strictEqual(decodeSpe(new Uint8Array([0xD7, 0xE5, 0xF0, 0xED, 0xE8, 0xEA, 0xE0])), "Черника");
});

// двоичные счета после SPECTR= могут случайно образовать строку «КЛЮЧ=…» — она не должна попасть в заголовок
test("после SPECTR= новых ключей нет", () => {
  assert.strictEqual(parseSpeHeader("SHIFR=a\r\nSPECTR=\r\nZZZ=1").raw.ZZZ, undefined);
});

test("повтор ключа: берётся первое значение", () => {
  assert.strictEqual(parseSpeHeader("SHIFR=a\nSHIFR=b\nSPECTR=").shifr, "a");
});
