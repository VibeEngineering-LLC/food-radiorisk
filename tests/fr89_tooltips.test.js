// #FR-89 v29: подсказки секторов (полное название, доля, величина) и короткие названия в легенде
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { doseSlices, riskSlices, homeRadonDoseSv, fmtShare } from '../src/calc/summary_charts.js';

const input = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const result = computeScenario(data, input);
const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: 100 });
const fig = (id) => html.match(new RegExp('data-chart="' + id + '"[^]*?</figure>'))[0];

test('FR-89 v29: у каждого сектора подсказка с полным названием, долей и величиной; у тонких — зона наведения', () => {
  const ds = doseSlices(result.comparison, homeRadonDoseSv(input, result.comparison, 100), { radonC: 100, radonIsDefault: false });
  const part = fig('dose');
  for (const s of ds.slices) assert.ok(part.includes(`<title>${s.id === 'product' ? 'Этот продукт: молоко (Cs-137) — по расчёту' : s.label}: ${fmtShare(s.share)};`.replace(/ /g, ' ')), 'подсказка сектора ' + s.id); // строка питания названа с продуктом из формы
  assert.equal((part.match(/<path class="pie-sl[^>]*tabindex="0"/g) || []).length, ds.slices.length, 'сектора доступны с клавиатуры');
  assert.ok(/<line class="pie-hit"/.test(part), 'тонкий сектор питания имеет зону наведения');
});

test('FR-100: легенда — понятные названия, коды МКБ/ВОЗ — в title ячейки', () => {
  const rs = riskSlices(result.lifeRisks);
  const part = fig('risk');
  assert.ok(part.includes('<td title="Дорожно-транспортные происшествия — код ВОЗ 1096">Дорожно-транспортные происшествия</td>'), 'код ВОЗ — только в подсказке');
  assert.ok(part.includes('>Болезни системы кровообращения (инфаркт, инсульт)</td>'));
  assert.equal(rs.slices.length, (part.replace(/<tr class="pie-sub"[^]*?<\/tr>/g, '').match(/<td title=/g) || []).length); // подстроки «в т. ч.» (#FR-95) — не сектора
});
