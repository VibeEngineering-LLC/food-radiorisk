// #FR-69: r (МКРЗ 103 табл. 1; НРБ п. 2.3) — номинальный риск С УЧЁТОМ ВРЕДА, не число заболевших (МКРЗ 103 п. A106, табл. A.4.1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { presetRadGear } from '../src/ui/form.js';
import { buildReport } from '../src/ui/report.js';
import { RISK_TXT } from '../src/ui/render.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const BAD = /случа|заболеть|человек из|млн в год/i; // НРБ п. 2.3: 10⁻⁶ и 5·10⁻⁵ — пожизненный риск, не «в год»
const input = { ...presetRadGear(), years: 10 };

test('отчёт md и уровни НРБ: риск без «случаев рака», с пометкой «с учётом вреда»', () => {
  const text = buildReport('md', { input, result: computeScenario(data, input) }, { datasets: 1, records: 1, sha: '0' }, '2026-10-03T00:00:00.000Z').text;
  assert.match(text, /Пожизненный риск \(номинальный, с учётом вреда\)/);
  assert.doesNotMatch(text, BAD);
  for (const v of Object.values(RISK_TXT)) {
    assert.doesNotMatch(v, BAD);
  }
});

test('блок риска (Result.jsx): без «случаев», ссылки на п. A106 и табл. A.4.1', async () => {
  for (const f of ['src/react/Result.jsx']) {
    const raw = await readFile(root + f, 'utf8');
    const ui = raw.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(ui, BAD, f);
    assert.match(ui, /п\. A106/, f);
    assert.match(ui, /табл\. A\.4\.1/, f);
  }
});
