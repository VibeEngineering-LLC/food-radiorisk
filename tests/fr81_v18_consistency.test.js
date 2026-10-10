// #FR-81 V18: приёмка согласованности (D-022) — рендер всех вкладок сценариев S1–S5 (tests/v18_render_all.mjs); таблица чисел «на 1 000 000» и запрещённые слова
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAll, analyse } from './v18_render_all.mjs';

const rep = analyse(await renderAll());

test('V18: каждое число риска на главном экране и во вкладках 1–4 равно R сценария', () => {
  assert.deepEqual(rep.missing, [], 'не найдено: ' + rep.missing.join('; '));
  assert.equal(rep.table.length, 15, 'по три числа на сценарий: главное, фон, строка продукта вкладки «Бытовые риски»');
  assert.deepEqual(rep.table.filter(r => !r.ok), [], 'числа, не равные R');
});

test('V18: запрещённые слова — 0 совпадений на главном экране и во вкладках 3–4', () => {
  assert.deepEqual(rep.forbidden, []);
});

test('V18: оценка по дозе и строка «Доза за самый нагруженный год» называют одну дозу', () => {
  assert.deepEqual(rep.doseMismatch, []);
});
