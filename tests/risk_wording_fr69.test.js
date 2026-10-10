// #FR-69: r (МКРЗ 103 табл. 1; НРБ п. 2.3) — номинальный риск С УЧЁТОМ ВРЕДА, не число заболевших (МКРЗ 103 п. A106, табл. A.4.1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { presetRadGear } from '../src/ui/form.js';
import { buildReport } from '../src/ui/report.js';
import { T } from '../src/ui/texts_v.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const BAD = /случа|заболеть|человек из|млн в год/i; // НРБ п. 2.3: 10⁻⁶ и 5·10⁻⁵ — пожизненный риск, не «в год»
const input = { ...presetRadGear(), years: 10 };

test('отчёт md: «Итог» без «случаев рака» и без формулировок с «в год» у риска (V15: строки как на экране)', () => {
  const text = buildReport('md', { input, result: computeScenario(data, input) }, { datasets: 1, records: 1, sha: '0' }, '2026-10-03T00:00:00.000Z').text;
  assert.doesNotMatch(text, BAD);
});

test('тексты главного экрана (texts_v.json): без «случаев», «заболеть» и «в год» у риска; подпись числа без слова «рак»', () => {
  for (const [k, v] of Object.entries(T)) if (/^(MAIN|VERBAL|EQUIV|DOSE|LINK|AGE|LNT)/.test(k) && typeof v === 'string') assert.doesNotMatch(v, BAD, k);
  assert.doesNotMatch(T.MAIN_CAPTION, /рак/i); // МКРЗ 103 п. 87: слова «рак» в формулировке о смертельном риске нет (D-022)
  assert.match(T.MAIN_CAPTION, /номинальный риск смерти от последствий облучения для условного человека/i);
});
