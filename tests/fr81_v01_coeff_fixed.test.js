// #FR-81 V01: коэффициент риска фиксирован 0,05 (НРБ-99/2009 п. 2.3) — выбора нет, значение из записи данных
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screen, ch } from './render_scenario.js';
import { data, run, runWith } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { serialize, restore } from '../src/react/persist.js';

const base = S.initialRaw(listChoices(data));

test('V01: входной riskCoeffPerSv игнорируется — риск = 0,05 · доза', () => {
  const r = run('milk', 'молоко', [['Cs-137', 100]], { riskCoeffPerSv: 0.057 });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.totals.riskTotal - 0.05 * r.totals.doseSvTotal) < 1e-15);
});

test('V01: коэффициент берётся из записи данных', () => {
  const d2 = { ...data, risk: data.risk.map(x => x.id === 'nrb2009_p23_avg_risk_coeff' ? { ...x, value: 0.06 } : x) };
  const r = runWith(d2, 'milk', 'молоко', [['Cs-137', 100]], { riskCoeffPerSv: undefined });
  assert.ok(Math.abs(r.totals.riskTotal - 0.06 * r.totals.doseSvTotal) < 1e-15);

  const d3 = { ...data, risk: data.risk.filter(x => x.id !== 'nrb2009_p23_avg_risk_coeff') };
  const r3 = runWith(d3, 'milk', 'молоко', [['Cs-137', 100]], { riskCoeffPerSv: undefined });
  assert.equal(r3.ok, false);
  assert.ok(r3.errors.includes('нет коэффициента риска в данных'));
});

test('V01: сохранённый выбор riskCoeff отбрасывается при восстановлении', () => {
  assert.equal('riskCoeff' in base, false);
  const back = restore(serialize({ ...base, riskCoeff: '0.057' }, 0), base, listChoices(data).nuclides);
  assert.equal('riskCoeff' in back.raw, false);
});

test('V01: в форме нет выбора коэффициента риска', async () => {
  const h = (await screen({ comp: ['src/react/Form.jsx', 'default', () => ({ choices: ch, raw: base, setRaw() {}, tab: 2, setTab() {}, onPreset() {}, onExport() {} })] })).html;
  assert.doesNotMatch(h, /Коэффициент риска/);
  assert.doesNotMatch(h, /5,7·10⁻²/);
});
