// #FR-81 D02/E02: в расчёт B входят только записи ТР ТС 021/2011 Прил. 4; прочерк — «не нормируется»; другие регламенты — справочно
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';

test('D02: мука — Sr-90 не нормируется (Прил. 4 п. 15), B только по Cs-137 = 0,5, соответствует', () => {
  const res = run('cereals', 'Мука пшеничная', [['Cs-137', 30], ['Sr-90', 20]]);
  const sr90 = res.limits.ru.find(l => l.nuclide === 'Sr-90');
  assert.ok(sr90, 'запись для Sr-90 должна присутствовать');
  assert.equal(sr90.limitId, null, 'limitId для Sr-90 должен быть null');
  assert.equal(sr90.notNormed, true, 'notNormed для Sr-90 должен быть true');
  assert.equal(res.limits.compliance.B, 0.5, 'B должен быть равен 0.5');
  assert.equal(res.limits.compliance.verdict, 'conforms', 'verdict должен быть conforms');
});

// #FR-81 P2-1: исключение одно — вода (ТР ЕАЭС 044, на него отсылает сам Прил. 4)
test('D02: в B не попадает ни одна норма вне Прил. 4, кроме воды по ТР ЕАЭС 044 (все группы, оба нуклида)', () => {
  const codes = [...new Set(data.limits_ru.map(r => r.food_group_code))];
  for (const code of codes) {
    const res = run(code, 'продукт', [['Cs-137', 10], ['Sr-90', 10]]);
    for (const l of res.limits.ru) {
      assert.ok(
        l.limitId === null || l.limitId.startsWith('t021_p4_') || (code === 'water' && l.limitId.startsWith('t044_water_')),
        `${code}: ${l.limitId}`
      );
    }
  }
});

test('D02: масличные — в Прил. 4 нормы нет: B не считается, ТР ТС 015 показан справочно с предупреждением', () => {
  const res = run('oilseeds', 'подсолнечник', [['Cs-137', 30]]);
  assert.equal(res.limits.compliance, null, 'compliance должен быть null');
  assert.equal(res.limits.ru[0].reference.H, 60, 'reference.H должен быть 60');
  assert.match(res.warnings.join(' '), /Прил\. 4/, 'warnings должен содержать упоминание Прил. 4');
});
