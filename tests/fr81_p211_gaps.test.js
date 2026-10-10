// #FR-81 P2-11 (fix-review-1 №11): пробелы тестов — класс «прочие» для непонятной категории, прочерк только из Прил. 4, ключ группы нуклидов в E09
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run, runWith } from './fr81_helpers.js';
import { foreignClasses } from '../src/calc/foodclass.js';

test('P2-11: категория без распознанных слов — класс general; пустая — классов нет', () => {
  assert.deepEqual(foreignClasses('Особая категория без ключевых слов'), ['general']);
  assert.deepEqual(foreignClasses(''), []);
});

test('P2-11: прочерк «не нормируется» берётся только из Прил. 4: у группы без записей Прил. 4 — предупреждение «нормы нет»', () => {
  // у зерновых-бобовых нет записи Прил. 4; служебная запись другого регламента со значением null — не прочерк Прил. 4
  const d = { ...data, limits_ru: [...data.limits_ru, { id: 'rule_synthetic', food_group_code: 'pulses', nuclide: 'Cs-137', value: null }] };
  const r = runWith(d, 'pulses', 'продукт', [['Cs-137', 10]]);
  assert.equal(r.limits.ru[0].notNormed, false);
  assert.ok(r.warnings.some(w => /нормы нет/.test(w)));
});

test('P2-11: E09 — самая узкая категория считается внутри группы нуклидов: Cs «прочие» не вытесняется молочной нормой Sr', () => {
  const d = { ...data, limits_foreign: data.limits_foreign.filter(f => f.id !== 'eu_2016_52_a1_other_cs_dairy') };
  const ids = runWith(d, 'milk', 'Молоко', [['Cs-137', 100], ['Sr-90', 10]]).limits.foreign.map(f => f.id);
  assert.ok(ids.includes('eu_2016_52_a1_sr_dairy'));
  assert.ok(ids.includes('eu_2016_52_a1_other_cs_other'), ids.join(','));
});
