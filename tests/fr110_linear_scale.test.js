// #FR-110 (оператор 2026-10-11: «шкалы нужны линейные. ужми столбцы влево») и #FR-111 («размести текст по ширине блока»)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const result = computeScenario(data, input);
const html = await renderJsx('src/react/Compare.jsx', 'default', { comparison: result.comparison, input, radonC: NaN, setRadonC() {}, dwellU: NaN, setDwellU() {} });
const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const widths = [...html.matchAll(/class="cmpbar"><i style="width:([\d.]+)%/g)].map(m => Number(m[1]));
const doses = result.comparison.rows.map(r => r.doseSv).sort((a, b) => a - b);

test('FR-110: заголовок «Шкала (линейная)», слова «логарифм» на вкладке нет', () => {
  assert.ok(text.includes('Шкала (линейная)'));
  assert.doesNotMatch(text, /логарифм/i);
});

test('FR-110: ширина полосы пропорциональна дозе (отношение двух строк = отношению доз), максимум = 100 %', () => {
  // на экране к строкам сравнения добавлена строка «радон в вашем жилище» (значение региона по умолчанию) — её доза в result.comparison не входит
  assert.equal(widths.length, doses.length + 1);
  assert.ok(Math.abs(widths[widths.length - 1] - 100) < 1e-6);
  for (const d of doses) assert.ok(widths.some(w => Math.abs(w - d / doses[doses.length - 1] * 100) < 1e-4), `доза ${d}`);
  // две строки с заметной шириной: отношение ширин = отношению доз
  const big = doses.slice(0, 6).map((d, i) => [widths[i], d]).filter(([w]) => w > 1); // радон (0,156 Зв) стоит после первых шести строк
  assert.ok(big.length >= 2);
  const [a, b] = [big[0], big[big.length - 1]];
  assert.ok(Math.abs(b[0] / a[0] / (b[1] / a[1]) - 1) < 1e-4);
});

test('FR-110: строки по возрастанию дозы (D-030): полосы не убывают, подписи в порядке доз', () => {
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] >= widths[i - 1], `строка ${i}`);
  const labels = result.comparison.rows.slice().sort((a, b) => a.doseSv - b.doseSv).filter(r => r.label).map(r => r.label);
  let pos = -1;
  for (const l of labels) { const p = text.indexOf(l); assert.ok(p > pos, l); pos = p; }
});

test('FR-110: столбцы таблицы сравнения ужаты влево — класс cmp-table и ширина шкалы заданы в styles.css', () => {
  assert.match(html, /<table class="cmp-table"/);
  const css = readFileSync(root + 'src/ui/styles.css', 'utf8');
  assert.match(css, /table\.cmp-table th:last-child[^{]*\{[^}]*width:\s*\d+%/);
});

// мини-каскад: max-width, действующий на li внутри ol.biblio (самое специфичное правило из styles.css)
function bibliLiMaxWidth() {
  const css = readFileSync(root + 'src/ui/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const spec = { 'li': 1, 'ol.biblio li': 3 };
  let best = { s: 0, v: null };
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const mw = m[2].match(/(?:^|;|\s)max-width:\s*([^;]+)/);
    if (!mw || m[1].includes('@')) continue;
    for (const sel of m[1].split(',').map(s => s.trim())) if (spec[sel] >= best.s) best = { s: spec[sel], v: mw[1].trim() };
  }
  return best.v;
}

test('FR-111: у ol.biblio li нет max-width меньше 100 % (список литературы на всю ширину вкладки)', () => {
  const v = bibliLiMaxWidth();
  assert.ok(v === 'none' || v === '100%', `max-width: ${v}`);
});
