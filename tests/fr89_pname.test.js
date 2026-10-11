// #FR-89: строка питания названа продуктом из формы; длинное название — с многоточием в легенде, полностью в подсказке
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const draw = async (name) => {
  const input = inputFor('milk', name, [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
  return renderJsx('src/react/SummaryTab.jsx', 'default', { result: computeScenario(data, input), input, radonC: 100 });
};
test('FR-89: короткое название продукта — в легенде, подсказке и выноске обеих диаграмм', async () => {
  const html = await draw('говядина');
  assert.equal((html.match(/<td title="Этот продукт: говядина \(Cs-137\) — по расчёту">Этот продукт: говядина \(Cs-137\) — по расчёту<\/td>/g) || []).length, 1, 'легенда (а)');
  assert.equal((html.match(/<td title="Этот продукт: говядина — радиационно-индуцированный рак">Этот продукт: говядина — радиационно-индуцированный рак<\/td>/g) || []).length, 1, 'легенда (б)');
  assert.equal((html.match(/Этот продукт \(говядина\): /g) || []).length, 2, 'выноски (а) и (б)');
});
test('FR-89: длинное название — многоточие в легенде, полностью в подсказке', async () => {
  const long = 'печень северного оленя вяленая домашняя';
  const html = await draw(long);
  assert.ok(html.includes(`title="Этот продукт: ${long} (Cs-137) — по расчёту"`) && html.includes(`>Этот продукт: ${long.slice(0, 23)}…</td>`));
});
