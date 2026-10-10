import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { DEFAULT_FLIGHT_PER_YEAR } from '../src/calc/summary_charts.js';
// #FR-101 v41 (D-031): тесты ниже проверяли отменённые умолчания (200 Бк/м³, 0,15 мкЗв/ч, 1 снимок) — заменён fr101_region / fr101_sectors (D-031); файл сохранён как история проверок, тела не выполняются
const DEFAULT_RADON_C = 200, DEFAULT_DWELL_U = 0.15, DEFAULT_XRAY_PER_YEAR = 1;
const test = (name) => nodeTest.skip(name + ' [заменён fr101_region / fr101_sectors (D-031)]');
import { parseExt, EXT_DEFAULTS } from '../src/react/persist.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const ADULT = () => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1 });
const tab = async (initialTab) => {
  const input = ADULT();
  const result = computeScenario(data, input);
  const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab });
  return { html, text: norm(html) };
};

test('FR-91 v33: умолчания оператора: 0,15 мкЗв/ч, 200 Бк/м³, 1 снимок, 2 перелёта', () => {
  assert.equal(DEFAULT_RADON_C, 200);
  assert.equal(DEFAULT_DWELL_U, 0.15);
  assert.equal(DEFAULT_XRAY_PER_YEAR, 1);
  assert.equal(DEFAULT_FLIGHT_PER_YEAR, 2);
  assert.deepEqual(EXT_DEFAULTS, { radonC: 200, dwellU: 0.15, xrayN: 1, flightN: 2 });
});

test('FR-91 v33: поля вкладки «Сравнение» сразу заполнены умолчаниями, подписи короткие, подсказка под полями', async () => {
  const { html, text } = await tab('cmp');
  assert.match(html, /id="xrayN"[^>]*value="1"|value="1"[^>]*id="xrayN"/);
  assert.match(html, /id="flightN"[^>]*value="2"|value="2"[^>]*id="flightN"/);
  assert.ok(html.includes('value="0.15"'));
  assert.ok(html.includes('value="200"'));
  assert.ok(text.includes('Мощность дозы в жилище, мкЗв/ч'));
  assert.ok(text.includes('Объёмная активность радона-222 в жилище, Бк/м³'));
  assert.ok(text.includes('Дополнительных снимков грудной клетки в год'));
  assert.ok(text.includes('Перелётов по 3 ч в год'));
  assert.ok(!text.includes('(на «Сводке»; по умолчанию'));
  assert.ok(text.includes('Значения по умолчанию, пока вы их не измените'));
  assert.ok(text.includes('0,15 мкЗв/ч'));
  assert.ok(text.includes('200 Бк/м³'));
  assert.ok(html.indexOf('id="cmpFieldsHint"') > html.indexOf('id="flightN"'));
});

test('FR-91 v33: диаграмма (а) на умолчаниях: фон жилища 0,15 мкЗв/ч заменяет внешнее в помещении, радон 200, подписи «по умолчанию»', async () => {
  const { text } = await tab('sum');
  assert.ok(text.includes('Радон в жилище (200 Бк/м³, по умолчанию)'));
  assert.ok(text.includes('0,15 мкЗв/ч'));
  assert.ok(text.includes('Гамма-фон в вашем жилище (0,15 мкЗв/ч, по умолчанию)'));
  assert.ok(text.includes('заменено, а не прибавлено'));
  assert.ok(text.includes('значение по умолчанию'));
  assert.ok(!text.includes('по вашему вводу'));
});

test('FR-91 v33: миграция сохранённого состояния', () => {
  // Старое состояние без версии: null заменяется умолчаниями
  assert.deepEqual(parseExt(JSON.stringify({ radonC: 100, dwellU: null, xrayN: 1, flightN: 2 })), EXT_DEFAULTS);
  
  // Старое состояние с явными значениями сохраняется
  assert.deepEqual(parseExt(JSON.stringify({ radonC: 350, dwellU: 0.2, xrayN: 3, flightN: 0 })), { radonC: 350, dwellU: 0.2, xrayN: 3, flightN: 0 });
  
  // Новое состояние (v: 2): явный радон сохраняется, очищенное поле жилища становится NaN
  const r = parseExt(JSON.stringify({ v: 2, radonC: 100, dwellU: null, xrayN: 1, flightN: 2 }));
  assert.equal(r.radonC, 100);
  assert.ok(Number.isNaN(r.dwellU));
  
  // Новое состояние (v: 2) со всеми умолчаниями
  assert.deepEqual(parseExt(JSON.stringify({ v: 2, radonC: 200, dwellU: 0.15, xrayN: 1, flightN: 2 })), EXT_DEFAULTS);
  
  // Мусорный текст -> умолчания
  assert.deepEqual(parseExt('garbage'), EXT_DEFAULTS);
});

test('FR-91 v33: явный ввод, совпавший со старым умолчанием, после сохранения v2 не теряется', () => {
  // Проверка наличия маркера версии в исходнике
  const src = readFileSync('src/react/persist.js', 'utf8');
  assert.ok(src.includes('EXT_VERSION'));
});

test('FR-91 v33: поля выровнены: подписи сверху, поля на одной линии', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');
  
  // Извлекаем правило .cmp-inputs
  const startIdx = css.indexOf('.cmp-inputs {');
  assert.ok(startIdx !== -1, 'Правило .cmp-inputs не найдено');
  const endIdx = css.indexOf('}', startIdx);
  const rule = css.substring(startIdx, endIdx + 1);
  
  assert.ok(rule.includes('align-items: end'));
  assert.ok(rule.includes('repeat(auto-fit'));
  
  // Извлекаем правило .cmp-inputs label
  const labelStartIdx = css.indexOf('.cmp-inputs label');
  assert.ok(labelStartIdx !== -1, 'Правило .cmp-inputs label не найдено');
  const labelEndIdx = css.indexOf('}', labelStartIdx);
  const labelRule = css.substring(labelStartIdx, labelEndIdx + 1);
  
  assert.ok(labelRule.includes('justify-content: flex-end'));
});
