// #FR-88 v18, пункт 3 (слой f): пустое, нечисловое, отрицательное и огромное значение поля формы — сообщение по-русски, а не доза и не исключение
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeFields } from '../tools/check_form_fields.mjs';
import { userMessage } from '../src/calc/input_check.js';
import { numOrNull } from '../src/ui/form.js';

const recs = await probeFields();
const byKey = new Map(recs.map(r => [r.label, r]));
const parse = (r) => { const m = r.label.match(/^(\w+)\/(\S+?)=(.*)$/); return { mode: m[1], field: m[2], value: JSON.parse(m[3]) }; };

test('ни один ввод не бросает исключение', () => {
  assert.deepEqual(recs.filter(r => r.thrown).map(r => r.label), []);
});

test('сообщения об ошибках — по-русски', () => {
  for (const r of recs) {
    if (!r.msg) continue;
    const cleaned = r.msg.replace(/[A-Z][a-z]?-\d+/g, '');
    assert.ok(!/[A-Za-z]{4,}/.test(cleaned), r.label + ': ' + r.msg);
  }
});

test('недопустимые значения полей дают ошибку, а не дозу', () => {
  const ALL = ['base', 'life', 'dried', 'conc', 'fr', 'dep'];
  const MEAS = ['base', 'life', 'dried', 'conc', 'fr'];
  const BAD_NUM = ['', 'abc', '-1', '1e400', '1e308', '1e10', '1e13', 'NaN'];
  const MUST = [
    [ALL, 'portionG', BAD_NUM], [ALL, 'timesPerDay', BAD_NUM], [ALL, 'daysPerWeek', BAD_NUM],
    [ALL, 'weeksPerMonth', BAD_NUM], [ALL, 'monthsPerYear', BAD_NUM],
    [ALL.filter(x => x !== 'life'), 'years', ['', 'abc', '-1', '0', '1e400', '1e308', '1e10', '1e13', 'NaN']],
    [MEAS, 'n.measured', ['', 'abc', '-1', '1e400', '1e308', '1e13', 'NaN']],
    [MEAS, 'n.unc', ['abc', '-1', '1e10', '1e13', '1e400', 'NaN']],
    [MEAS, 'n.sampleDate', [' ', 'abc', '-1', '0', '1,5', 'NaN', '2026-13-45', '1e10']],
    [ALL, 'eatDate', ['abc', '-1', '0', '1,5', 'NaN', '2026-13-45']],
    [['dep'], 'n.dep', ['', 'abc', '-1', '1e400', 'NaN', '1e13']],
    [['dep'], 'n.depDate', ['abc', '-1', '0', '1,5', '2026-13-45']],
    [['life'], 'startAge', ['', 'abc', '-1', '1e400', '1e308', 'NaN', '1e10']],
    [['life'], 'endAge', ['abc', '-1', '0', '1e400', '1e308', '1e10', 'NaN']],
    [['fr'], 'procFr', ['', 'abc', '-1', '1e400', '1e10', '1,5', 'NaN']],
    [['conc'], 'concK', ['', 'abc', '-1', '0', '1e400', 'NaN']]
  ];
  const failures = [];
  for (const [modes, field, values] of MUST) {
    for (const mode of modes) {
      for (const value of values) {
        const key = `${mode}/${field}=${JSON.stringify(value)}`;
        const r = byKey.get(key);
        if (!r) failures.push(key);
        else if (!r.thrown && (r.ok !== false || !/[А-Яа-яЁё]/.test(r.msg))) failures.push(key); // исключения ловит первый тест
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('нулевая доза без сообщения — только при значении, равном нулю', () => {
  for (const r of recs) {
    if (r.ok && !(r.dose > 0)) {
      const { value } = parse(r);
      if (String(value).trim() === '') continue; // пробелы — отдельный тест ниже
      assert.ok(String(value).trim() !== '' && Number(value) === 0, r.label);
    }
  }
});

test('пробел в числовом поле — пусто', () => {
  assert.equal(numOrNull(' '), null);
  assert.equal(numOrNull('  \t'), null);
  assert.equal(numOrNull(' 5 '), 5);
  assert.equal(numOrNull('1,5'), 1.5);
  assert.equal(numOrNull('1e400'), null);
  // сквозная проверка: пробел в обязательном числовом поле — ошибка, а не нулевая доза
  const NUM = ['portionG', 'timesPerDay', 'daysPerWeek', 'weeksPerMonth', 'monthsPerYear', 'n.measured', 'procFr', 'concK', 'startAge'];
  const bad = recs.filter(r => { const p = parse(r); return p.value === ' ' && NUM.includes(p.field) && !(p.field === 'n.measured' && p.mode === 'dep') && !(p.field === 'procFr' && p.mode !== 'fr') && !(p.field === 'concK' && p.mode !== 'conc') && !(p.field === 'startAge' && p.mode !== 'life'); });
  assert.ok(bad.length >= 20, 'мало записей с пробелом: ' + bad.length);
  assert.deepEqual(bad.filter(r => r.ok).map(r => r.label), []);
});

test('userMessage: английское исключение заменяется русской фразой', () => {
  assert.match(userMessage(new RangeError('complianceB: da must be >= 0')), /[А-Яа-яЁё]/);
  assert.ok(!/complianceB/.test(userMessage(new RangeError('complianceB: da must be >= 0'))));
  assert.equal(userMessage(new Error('Срок питания: укажите число лет')), 'Срок питания: укажите число лет');
  assert.equal(userMessage(Object.assign(new Error('plain text'), { plain: true })), 'plain text');
  assert.match(userMessage(null), /[А-Яа-яЁё]/);
});
