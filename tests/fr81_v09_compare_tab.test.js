// #FR-81 V09: вкладка «Сравнение с облучением» — без колонки риска и без абзацев о заболеваемости (0,1695 удалён, D-022); тексты CMP_* (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { T, fill } from '../src/ui/texts_v.js';

const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const draw = async () => { const input = S1(); const result = computeScenario(data, input); const html = await renderJsx('src/react/Compare.jsx', 'default', { comparison: result.comparison, input, radonC: 100, setRadonC() {}, dwellU: NaN, setDwellU() {} }); return norm(html); };

test('V09: тексты вкладки — введение, «не нормируется», ссылка на бытовые риски', async () => {
  const t = await draw();
  assert.ok(t.includes(fill(T.CMP_INTRO, { H: 50 })));
  assert.ok(t.includes(T.CMP_NOT_NORMED));
  assert.ok(t.includes(T.CMP_OTHER_RISKS));
});

test('V09: нет абзацев о заболеваемости и коэффициента 0,1695', async () => {
  const t = await draw();
  assert.doesNotMatch(t, /заболеть раком/);
  assert.doesNotMatch(t, /заболеваемост/);
  assert.doesNotMatch(t, /16,95|0,1695/);
});

test('V09: в таблице нет колонки риска', async () => {
  const t = await draw();
  assert.doesNotMatch(t, /Риск, порядок величины/);
  assert.ok(t.includes('Источник облучения') && t.includes('Шкала (логарифмическая)'));
});
