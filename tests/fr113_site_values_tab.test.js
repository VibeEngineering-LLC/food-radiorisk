// #FR-113 (оператор 2026-10-11: «Тоже в отдельную вкладку»): «Оценка плотности загрязнения места сбора» и «Значения величин и их источники» — во вкладке «Место сбора и величины», в «Подробном расчёте» их нет
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { T } from '../src/ui/texts_v.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
// сценарий как в fr92: для Cs-137 есть оценка плотности загрязнения по записям КП
const input = inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
input.nuclides[1] = { ...input.nuclides[1], transferId: 'perevolotsky2006_kp_sr_90_bilberry' };
const result = computeScenario(data, input);
const screen = async (initialTab) => norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab }));
const VALUES = 'Значения величин и их источники';
const SITE = 'Оценка плотности загрязнения';

test('FR-113: оба блока — во вкладке «Место сбора и величины»', async () => {
  const t = await screen('site');
  assert.ok(t.includes(VALUES));
  assert.ok(t.includes('Величина') && t.includes('Источник'));
  assert.ok(t.includes(SITE), 'для грибов с Cs-137 оценка загрязнения есть');
});

test('FR-113: в «Подробном расчёте» обоих блоков нет, остальное на месте', async () => {
  const t = await screen('calc');
  assert.ok(!t.includes(VALUES));
  assert.ok(!t.includes(SITE));
  assert.ok(t.includes('Расчёт по радионуклидам'));
});

test('FR-113: ссылка в тексте вкладки «Источники» указывает на новую вкладку', async () => {
  assert.match(T.SRC_BIBLIO_NOTE, /вкладке «Место сбора и величины», в таблице «Значения величин и их источники»/);
  assert.doesNotMatch(T.SRC_BIBLIO_NOTE, /Подробный расчёт/);
  const t = await screen('src');
  assert.ok(t.includes('вкладке «Место сбора и величины»'));
});
