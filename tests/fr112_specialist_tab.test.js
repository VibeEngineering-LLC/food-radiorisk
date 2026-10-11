// #FR-112 (оператор 2026-10-11: «это и ниже надо вынести в отдельную вкладку»): «Справочные величины для специалиста» и таблица органов — во вкладке «Для специалиста», в «Подробном расчёте» их нет
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const input = inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const result = computeScenario(data, input);
const screen = async (initialTab) => renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab });
const TITLE = 'Справочные величины для специалиста';

test('FR-112: ряд вкладок — «Для специалиста» после «Подробный расчёт» и «Место сбора и величины», всего 8', async () => {
  const html = await screen('spec');
  const labels = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)</g)].map(m => m[1]);
  assert.equal(labels.length, 8);
  assert.equal(labels[4], 'Подробный расчёт'); // #FR-118: «Сравнение» и «Бытовые риски» стоят на 2-3 местах
  assert.equal(labels[5], 'Место сбора и величины');
  assert.equal(labels[6], 'Для специалиста');
});

test('FR-112: заголовок и таблица органов — во вкладке «Для специалиста»', async () => {
  const t = norm(await screen('spec'));
  assert.ok(t.includes(TITLE));
  assert.ok(t.includes('Локализация'));
  assert.ok(t.includes('Добавочный риск умереть'));
});

test('FR-112: в «Подробном расчёте» заголовка и таблицы органов нет, остальное на месте', async () => {
  const t = norm(await screen('calc'));
  assert.ok(!t.includes(TITLE));
  assert.ok(!t.includes('Добавочный риск умереть'));
  assert.ok(t.includes('Расчёт по радионуклидам'));
});
