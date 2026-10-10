// #FR-81 E10: в таблице зарубежных норм есть колонка «Нуклид» (в отчёте и на экране)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { run } from './fr81_helpers.js';
import { screen } from './render_scenario.js';
import { buildReport } from '../src/ui/report.js';

const root = fileURLToPath(new URL('../', import.meta.url));
test('E10: отчёт — заголовок таблицы зарубежных норм начинается с «Нуклид», у строк назван нуклид', () => {
  const result = run('baby_food', 'Детская смесь', [['Cs-137', 10], ['Sr-90', 10]]);
  const md = buildReport('md', { input: {}, result }, { datasets: 1, records: 1, sha: '0' }, '2026-10-05T00:00:00.000Z').text;
  const part = md.slice(md.indexOf('Зарубежные нормы'));
  assert.match(part, /\|\s*Нуклид\s*\|\s*Юрисдикция/);
  assert.match(part, /\|\s*Sr-90\s*\|/);
  assert.match(part, /\|\s*Cs-137\s*\|/);
});
test('E10: экран (Result.jsx) — колонка «Нуклид» в таблице зарубежных норм', async () => {
  // #FR-81 P2-9: рендер вкладки «Нормы других стран» (продукт без группы норм РФ), а не чтение исходника .jsx
  const { html } = await screen({ product: 'xyz' });
  assert.match(html, /Нуклид Юрисдикция/);
  assert.match(html, /Cs-137/);
});
