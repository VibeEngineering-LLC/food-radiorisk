// #FR-83 v8 Н-3: ядро отказывает, если ряд записи не соответствует режиму (high с записью среднего ряда и наоборот)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick, run } from './fr83_v8_helpers.js';
import { T } from '../src/ui/texts_v.js';
test('режим high с записью среднего ряда — отказ ROW_MISMATCH', () => {
    const mid = pick('Говядина', 'default').rec.id;
    assert.ok(run('Говядина', mid, 'meat', 'high').errors.includes(T.DIET_ROW_MISMATCH));
});
test('режим default с записью высокого ряда — отказ ROW_MISMATCH', () => {
    const hi = pick('Говядина', 'high').rec.id;
    assert.ok(run('Говядина', hi, 'meat', 'default').errors.includes(T.DIET_ROW_MISMATCH));
});
test('high там, где десятый дециль ниже баланса (картофель), — отказ с причиной «высокое не установлено»', () => {
    const mid = pick('Картофель', 'default').rec.id;
    assert.ok(run('Картофель', mid, 'potato', 'high').errors.includes(T.DIET_HIGH_NOT_SET));
});
