// #FR-81 V4-4: tec16_txt_alcohol_oil — в TECDOC-1616 (введение) сказано «removal ... can be up to 99%»: Fr = 0,01 это НИЖНЯЯ граница, а не рекомендованное значение
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';

const ID = 'tec16_txt_alcohol_oil';
const calc = (processing) => run('other', 'Сырьё', [['Cs-137', 100]], { processing });

test('V4-4: в данных 0,01 только как value_min; рекомендованного и верхней границы нет, цитата источника — «up to 99%»', () => {
  const rec = data.processing.find(r => r.id === ID);
  assert.equal(rec.value_best, null);
  assert.equal(rec.value_min, 0.01);
  assert.equal(rec.value_max, null);
  assert.match(rec.quote, /can be up to 99%/);
  assert.match(rec.loc, /TECDOC-1616.*pdf\.md:75398-75400$/);
});

// «рекомендованное» и «минимум» для записи «не уточнено» к Cs-137: Fr = 1 (D-029, Q1) — см. tests/fr88_v19.test.js
