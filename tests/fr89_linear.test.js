import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { doseSlices, riskSlices, homeRadonDoseSv, linearAngles } from '../src/calc/summary_charts.js';

const ADULT = () => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });

async function figures(input) {
  const result = computeScenario(data, input);
  const html = await renderJsx('src/react/SummaryTab.jsx', 'default', { result, input, radonC: 100 });
  return {
    result,
    dose: html.match(/data-chart="dose"[\s\S]*?<\/figure>/)[0],
    risk: html.match(/data-chart="risk"[\s\S]*?<\/figure>/)[0]
  };
}

function sectorAngles(figureHtml) {
  const re = /<path class="pie-sl pie-s\d[^"]*" d="M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) A [\d.]+ [\d.]+ 0 ([01]) 1 ([\d.-]+) ([\d.-]+) Z"/g;
  const angles = [];
  let m;
  while ((m = re.exec(figureHtml)) !== null) {
    const cx = parseFloat(m[1]);
    const cy = parseFloat(m[2]);
    const x1 = parseFloat(m[3]);
    const y1 = parseFloat(m[4]);
    const x2 = parseFloat(m[6]);
    const y2 = parseFloat(m[7]);
    const a1 = Math.atan2(y1 - cy, x1 - cx);
    const a2 = Math.atan2(y2 - cy, x2 - cx);
    let angle = ((a2 - a1 + 2 * Math.PI) % (2 * Math.PI)) * 180 / Math.PI;
    angles.push(angle);
  }
  return angles;
}

test('FR-89: linearAngles — угол строго пропорционален доле', () => {
  assert.deepEqual(linearAngles([1, 3]), [90, 270]);
  assert.deepEqual(linearAngles([0, 1]), [0, 360]);

  const tiny = [1e-6, 0.3, 0.7 - 1e-6];
  const anglesTiny = linearAngles(tiny);
  assert.ok(Math.abs(anglesTiny[0] - 1e-6 * 360) < 1e-12);
  assert.ok(Math.abs(anglesTiny.reduce((a, b) => a + b, 0) - 360) < 1e-9);

  const shares = [0.2, 0.3, 0.5];
  const angles = linearAngles(shares);
  for (let i = 0; i < shares.length; i++) {
    assert.ok(Math.abs(angles[i] / 360 - shares[i]) < 1e-12);
  }

  const bad = [-1, NaN, 1];
  const anglesBad = linearAngles(bad);
  assert.ok(Math.abs(anglesBad[0]) < 1e-12);
  assert.ok(Math.abs(anglesBad[1]) < 1e-12);
  assert.ok(Math.abs(anglesBad[2] - 360) < 1e-12);
});

test('FR-89: сектора диаграммы доз нарисованы линейно', async () => {
  const input = ADULT();
  const { result, dose } = await figures(input);
  const slices = doseSlices(result.comparison, homeRadonDoseSv(input, result.comparison, 100)).slices;
  const angles = sectorAngles(dose);

  assert.equal(angles.length, slices.length);

  for (let i = 0; i < slices.length; i++) {
    const share = slices[i].share;
    const angle = angles[i];
    assert.ok(Math.abs(angle / 360 - share) < 2e-3, `Slice ${i} share ${share} angle ${angle} (линейно, малая не раздута)`);
  }
});

test('FR-89: сектора диаграммы рисков нарисованы линейно', async () => {
  const input = ADULT();
  const { result, risk } = await figures(input);
  const slices = riskSlices(result.lifeRisks).slices;
  const angles = sectorAngles(risk);

  assert.equal(angles.length, slices.length);

  for (let i = 0; i < slices.length; i++) {
    const share = slices[i].share;
    const angle = angles[i];
    // линейно для любой доли: малая не раздута (допуск — округление координат до 0,01)
    assert.ok(Math.abs(angle / 360 - share) < 2e-3, `Risk slice ${i} share ${share} angle ${angle}`);
  }
});

test('FR-89: нет логарифмического сжатия', async () => {
  const input = ADULT();
  const { result, dose } = await figures(input);
  const slices = doseSlices(result.comparison, homeRadonDoseSv(input, result.comparison, 100)).slices;
  const angles = sectorAngles(dose);

  // Находим долю продукта (питание)
  const foodSlice = slices.find(s => s.label && s.label.includes('Питание'));
  assert.ok(foodSlice, 'Food slice must exist');
  assert.ok(foodSlice.share < 1e-2, `доля питания ${foodSlice.share} мала (< 1 %)`);

  const foodAngle = angles[slices.indexOf(foodSlice)];
  assert.ok(Math.abs(foodAngle - foodSlice.share * 360) < 0.02, `угол питания ${foodAngle}° = доля × 360° = ${foodSlice.share * 360}° (линейно, без раздувания)`);

  // Легенда/выноska должна содержать текст
  assert.ok(dose.includes('Питание (молоко): '), 'выноска с названием продукта');
  assert.ok(/<text class="pie-callout"[^>]*>[\s\S]*?Питание \(молоко\): /.test(dose), 'Callout text must be in pie-callout element');
});
