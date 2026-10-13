// #FR-131 (v58, замечания оператора 2026-10-13: TODO-3, TODO-4, TODO-5). Каждый тест красный до правки, зелёный после; образцы — боевой ввод оператора.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario, listChoices } from '../src/calc/model.js';
import { presetBilberry } from '../src/ui/form.js';
import * as S from '../src/react/formState.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { statusText } from '../src/ui/status.js';

const ch = listChoices(data);
const UNPACKED = 'Питьевая вода неупакованная (из-под крана, колодец, скважина, родник)';
const PACKED = 'Вода питьевая упакованная (бутилированная)';
const MINERAL = 'Вода минеральная';
const NOTE = 'принят вид: неупакованная вода; уточните в списке';

// ввод оператора: «Вода», Rn-222 160 Бк/кг ±5 %, 2000 г, 1 р/день, 7 дн/нед, 4 нед/мес, 12 мес/год, 11 лет — тем же путём, что форма (raw -> toInput)
const operator = (name) => {
  const base = inputFor(null, name, [['Rn-222', 160, 8]], { portionKg: 2, timesPerDay: 1, daysPerWeek: 7, weeksPerMonth: 4, monthsPerYear: 12, portionsPerYear: 336, years: 11, eatDate: '2026-10-13', region: 'world' });
  return S.toInput(S.rawFromInput(base, ch), ch);
};
const bil = () => { const raw = S.autoFill(S.rawFromInput(presetBilberry(), ch), ch); return { raw, input: S.toInput(raw, ch) }; };

test('TODO-3: «Вода» без выбранного вида — радон считается как для неупакованной воды, пометка о принятом виде видна', () => {
  const r = computeScenario(data, operator('Вода'));
  assert.equal(r.ok, true, (r.errors || []).join('; '));
  assert.equal(r.radon?.packaging, 'unpacked');
  assert.ok(r.radon?.inhalation, 'вдыхание — как у неупакованной воды');
  assert.ok(r.rows.some(x => x.nuclide === 'Rn-222'), 'строка радона есть');
  assert.ok(r.warnings.some(w => w.includes(NOTE)), `нет пометки: ${r.warnings}`);
  assert.ok(!r.warnings.some(w => w.includes('Радон-222 не рассчитан')), 'красной плашки нет');
});

test('TODO-3: выбран вид воды (неупакованная) — расчёт тот же, пометки «принят вид» нет', () => {
  const r = computeScenario(data, operator(UNPACKED));
  assert.equal(r.ok, true, (r.errors || []).join('; '));
  assert.equal(r.radon.packaging, 'unpacked');
  assert.ok(!r.warnings.some(w => w.includes('принят вид')));
});

test('TODO-3: упакованная и минеральная вода — поведение не изменилось (радон без выбора группы норм не считается, пометки нет)', () => {
  for (const name of [PACKED, MINERAL]) {
    const r = computeScenario(data, operator(name));
    assert.equal(r.ok, false, name);
    assert.ok(!r.errors.concat(r.warnings).some(w => w.includes('принят вид')), name);
  }
});

test('TODO-4: пресет «черника» — рацион: 7 г, 1 р/день, 4 дн/нед, 3 нед/мес, 12 мес/год, 1 год', () => {
  const { raw, input } = bil();
  assert.deepEqual([raw.portionG, raw.timesPerDay, raw.daysPerWeek, raw.weeksPerMonth, raw.monthsPerYear, raw.years], ['7', '1', '4', '3', '12', '1']);
  assert.equal(input.portionKg, 0.007);
  assert.equal(input.portionsPerYear, 144);
});

test('TODO-4: черника — название и вид «сушёный»', () => {
  const { raw } = bil();
  assert.equal(raw.product, 'черника дикорастущая');
  assert.equal(raw.measuredForm, 'dried');
});

test('TODO-4: черника — K сушки 5 берётся по нормативу, не вводится вручную', () => {
  const { raw, input } = bil();
  assert.equal(raw.dfUser, false);
  assert.equal(input.dryingFactor, 5);
});

test('TODO-4: черника — Cs-137 4400 Бк/кг ±5 % (220), дата пробы 2024-04-26', () => {
  const cs = bil().input.nuclides[0];
  assert.deepEqual([cs.nuclide, cs.measuredBqPerKg, cs.measuredUncertaintyBqPerKg, cs.sampleDate], ['Cs-137', 4400, 220, '2024-04-26']);
});

test('TODO-4: черника — Sr-90 100 Бк/кг ±5 % (5), дата пробы 2024-04-26', () => {
  const sr = bil().input.nuclides[1];
  assert.deepEqual([sr.nuclide, sr.measuredBqPerKg, sr.measuredUncertaintyBqPerKg, sr.sampleDate], ['Sr-90', 100, 5, '2024-04-26']);
});

test('TODO-4: черника — оценка загрязнения места сбора Sr-90: «Сводная оценка» (ALL), расчёт идёт', () => {
  const { raw, input } = bil();
  assert.equal(input.nuclides[1].transferId, 'ALL');
  assert.equal(S.transferView(raw, ch, 1).value, 'ALL');
  assert.equal(computeScenario(data, { region: 'ru', ...input }).ok, true);
});

// ---------- TODO-5: вёрстка и статус ----------
const css = readFileSync(fileURLToPath(new URL('../src/ui/window.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel) => (css.match(new RegExp('(?:^|\\})\\s*' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}')) || [])[1] || '';

test('TODO-5а: кнопки вариантов в плашке «Возможные варианты» переносят текст (white-space: normal), не шире плашки (max-width: 100 %)', () => {
  const r = rule('#productMatch .btn');
  assert.match(r, /white-space:\s*normal/);
  assert.match(r, /max-width:\s*100%/);
});

test('TODO-5а: ряд кнопок .btnrow переносится (flex-wrap: wrap)', () => {
  assert.match(rule('.btnrow'), /flex-wrap:\s*wrap/);
});

test('TODO-5г: у тела вкладки запас снизу не меньше 16 px — последняя строка не прижата к рамке прокрутки', () => {
  const m = rule('.tabbody').match(/padding:\s*(\d+)px\s+(\d+)px\s+(\d+)px/);
  assert.ok(m && Number(m[3]) >= 16, rule('.tabbody'));
});

test('TODO-5в: статус «Расчёт не выполнен» называет первую причину из плашки; без причины — прежний текст', () => {
  assert.equal(statusText({ input: {}, result: { ok: false, errors: ['Укажите вид продукта', 'вторая'] } }), 'Расчёт не выполнен — исправьте ввод: Укажите вид продукта');
  assert.equal(statusText({ input: {}, result: { ok: false } }), 'Расчёт не выполнен — исправьте ввод');
});
