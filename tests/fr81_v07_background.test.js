// #FR-81 V07: строка фона A4 главного экрана — вероятность умереть от новообразований (код 1026) от возраста a до конца жизни; расчёт result.background в src/calc/model.js (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { fmtCount, fmtPerMillion } from '../src/ui/fmt.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const S2 = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const draw = async (dataX, input) => { const result = computeScenario(dataX, input); const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META }); const text = norm(html); return { result, main: text.slice(0, text.indexOf('Нормы РФ и ЕАЭС')) }; };
const NO_TABLE = { ...data, life_risks: data.life_risks.filter(r => r.kind !== 'life_table' && r.kind !== 'cause_shares') };

test('V07: S1 — строка фона на экране из расчёта', async () => {
  const { result, main } = await draw(data, S1());
  assert.equal(result.background.a, 20);
  assert.equal(result.background.code, '1026');
  assert.equal(result.background.year, 2019);
  assert.ok(Math.abs(result.background.F - 0.1564102702) < 1e-7);
  // формат чисел (160 000 и 16) проверяет V03 (tests/fr81_v03_fmt.test.js), здесь числа берутся из тех же функций
  const F = fmtCount(1e6 * result.background.F), k = fmtPerMillion(result.totals.riskNominal);
  assert.ok(main.includes(`из 1 000 000 человек в возрасте 20 лет от новообразований (рака и других опухолей) за оставшуюся жизнь умирают около ${F} (Россия, 2019 г.). Это питание добавило бы к ним около ${k}.`));
});

test('V07: возраст a — из режима «с a до b лет», иначе по возрастной группе', () => {
  assert.equal(computeScenario(data, S2()).background.a, 3);
  assert.equal(computeScenario(data, { ...S1(), age: '10y' }).background.a, 10);
  assert.equal(computeScenario(data, S1()).background.a, 20);
});

test('V07: нет таблицы дожития — строки фона нет, остальной экран цел', async () => {
  const { result, main } = await draw(NO_TABLE, S1());
  assert.equal(result.ok, true);
  assert.equal(result.background, null);
  assert.ok(!main.includes('Для сравнения'));
  assert.ok(main.includes('Риск от этого питания за 10 лет'));
  assert.ok(main.includes('Соответствие продукта нормам'));
});
