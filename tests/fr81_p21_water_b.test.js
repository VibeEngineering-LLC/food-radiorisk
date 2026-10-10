// #FR-81 P2-1: вода входит в показатель B по ТР ЕАЭС 044/2017 табл. 4 (примечание к Прил. 4 ТР ТС 021, PDF стр. 150); решение оператора 05.10
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

// Константы: предельно допустимые уровни (УВ) для нуклидов в воде
const UV = {
  'Po-210': 0.11,
  'Ra-226': 0.49,
  'Ra-228': 0.2,
  'Pb-210': 0.2,
  'Th-232': 0.6,
  'U-234': 2.8,
  'U-238': 3,
  'Sr-90': 4.9,
  'Cs-137': 11
};

// Регулярное выражение для поиска предупреждения о неполноте данных
const W = /B рассчитан не по всем нормируемым нуклидам/;

test('P2-1: вода Cs-137 150, Sr-90 8 Бк/кг — УВ 11 и 4,9, B = 150/11 + 8/4,9 ≈ 15,27, не соответствует', () => {
  const { limits, warnings } = run('water', 'Вода питьевая', [['Cs-137', 150], ['Sr-90', 8]]);
  
  // Проверяем, что предельные уровни (H) соответствуют значениям из таблицы
  assert.deepEqual(limits.ru.map(l => l.H), [11, 4.9]);
  
  // Проверяем расчет показателя B
  const expectedB = 150 / 11 + 8 / 4.9;
  assert.ok(Math.abs(limits.compliance.B - expectedB) < 1e-9);
  
  // Проверяем вердикт о несоответствии
  assert.equal(limits.compliance.verdict, 'nonconforms');
});

test('P2-1: введены 8 нуклидов табл. 4 по 10 % УВ (Ra-228 не имеет e(g) в ICRP 119) — B = 0,8, предупреждение называет только Ra-228', () => {
  // Ra-228 в табл. 4 есть, но коэффициента e(g) для него нет — ввести его нельзя
  const nuclides = Object.entries(UV).filter(([n]) => n !== 'Ra-228').map(([n, h]) => [n, h / 10]);
  const { limits, warnings } = run('water', 'Вода питьевая', nuclides);
  assert.equal(limits.ru.length, 8);
  assert.ok(Math.abs(limits.compliance.B - 0.8) < 1e-9);
  assert.equal(limits.compliance.verdict, 'conforms');
  const warning = warnings.find(w => W.test(w));
  assert.ok(warning, 'Ra-228 не введён - предупреждение есть');
  assert.ok(warning.includes('Ra-228'));
  assert.ok(!/Ra-226|Cs-137|Sr-90|U-238/.test(warning.split('(')[0]), 'введённые нуклиды не названы невведёнными');
});

test('P2-1: вода, введены Cs-137 и Ra-226 — предупреждение называет невведённые (Sr-90, Po-210, U-238)', () => {
  const { limits, warnings } = run('water', 'Вода питьевая', [['Cs-137', 1], ['Ra-226', 0.1]]);
  
  // Ищем предупреждение о неполноте
  const warning = warnings.find(w => W.test(w));
  assert.ok(warning, 'Предупреждение о неполноте должно присутствовать');
  
  // Проверяем, что в предупреждении указаны невведенные нуклиды
  assert.ok(warning.includes('Sr-90'), 'Предупреждение должно упоминать Sr-90');
  assert.ok(warning.includes('Po-210'), 'Предупреждение должно упоминать Po-210');
  assert.ok(warning.includes('U-238'), 'Предупреждение должно упоминать U-238');
  
  // Проверяем, что в предупреждении упоминается ТР ЕАЭС 044
  assert.ok(warning.includes('044'), 'Предупреждение должно упоминать 044');
  
  // Проверяем, что введенный нуклид Ra-226 НЕ упоминается как невведенный
  assert.ok(!warning.includes('Ra-226'), 'Предупреждение не должно упоминать Ra-226 как невведенный');
});

test('P2-1: Ra-226 в группе «вода» входит в B, а у еды (молоко) в B не входит', () => {
  // Для воды Ra-226 входит в расчет B
  const waterResult = run('water', 'Вода', [['Ra-226', 0.49]]);
  assert.equal(waterResult.limits.compliance.B, 1);
  
  // Для молока Ra-226 не входит в расчет B (только Cs-137 учитывается)
  const milkResult = run('milk', 'Молоко', [['Cs-137', 10], ['Ra-226', 5]]);
  assert.equal(milkResult.limits.ru.length, 1);
});
