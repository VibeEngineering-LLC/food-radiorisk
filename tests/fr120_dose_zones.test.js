// #FR-120 (оператор 2026-10-11: «тут не надо подсвечивать?»): карточки «Доля нормы НРБ-99/2009» красятся по зоне дозы; карточки доз нейтральные
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { doseZone } from '../src/calc/dose_zone.js';
import { renderJsx } from './render_helper.js';

const input = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const real = computeScenario(data, input).totals;
const cards = async (avg5, maxYear) => {
  const totals = { ...real, doseTechAvg5: avg5, budgetShare1mSvAvg5: avg5 / real.limitYearSv, doseMaxYearTech: maxYear, maxYearShare5mSv: maxYear / real.limitMaxYearSv };
  const html = await renderJsx('src/react/Result.jsx', 'KpiGrid', { totals, input });
  return [...html.matchAll(/<div class="kpi([^"]*)">(?:<div class="krow">[^<]*<\/div>)?<div class="v">([^<]*)<[\s\S]*?<div class="l">([^<]*)</g)].map(m => ({ cls: m[1].trim(), value: m[2], label: m[3] }));
};

test('FR-120: уровни берутся из расчёта: 10 мкЗв/год, 1 мЗв/год, 5 мЗв', () => {
  assert.equal(real.optimNegligibleSv, 1e-5);
  assert.equal(real.limitYearSv, 1e-3);
  assert.equal(real.limitMaxYearSv, 5e-3);
});

test('FR-120: Ē₅ 5 мкЗв / 60 мкЗв / 2 мЗв — карточка доли нормы зелёная / янтарная / красная, слово зоны в подписи', async () => {
  const g = (await cards(5e-6, 1e-6))[3], y = (await cards(60e-6, 1e-6))[3], r = (await cards(2e-3, 1e-6))[3];
  assert.equal(g.cls, 'risk-negligible');
  assert.equal(y.cls, 'risk-within');
  assert.equal(r.cls, 'risk-exceeds');
  assert.ok(g.label.startsWith('пренебрежимо мало') && y.label.startsWith('ниже предела') && r.label.startsWith('выше предела'));
});

test('FR-120: карточка «1-й год питания» — по порогу 10 мкЗв и пределу 5 мЗв; карточки доз нейтральные', async () => {
  const c = async (d) => (await cards(1e-6, d));
  assert.equal((await c(5e-6))[1].cls, 'risk-negligible');
  assert.equal((await c(60e-6))[1].cls, 'risk-within');
  assert.equal((await c(6e-3))[1].cls, 'risk-exceeds');
  const all = await c(60e-6);
  assert.equal(all[0].cls, '');
  assert.equal(all[2].cls, '');
  assert.equal(doseZone(1e-5, 1e-5, 1e-3), 'negligible');
  assert.equal(doseZone(NaN, 1e-5, 1e-3), '');
});
