// #FR-83 v8 Н-3: ядро отказывает, если запись рациона не принадлежит группе продукта (и честный вход проходит)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pick, run } from './fr83_v8_helpers.js';
import { T } from '../src/ui/texts_v.js';
test('честный вход проходит: говядина — среднее и высокое', () => {
    assert.ok(run('Говядина', pick('Говядина', 'default').rec.id, 'meat').ok);
    assert.ok(run('Говядина', pick('Говядина', 'high').rec.id, 'meat', 'high').ok);
});
test('запись мяса при продукте «сыр» (source_required) и при ягоде (not_established) — отказ с причиной', () => {
    const id = pick('Говядина', 'default').rec.id;
    assert.ok(run('сыр', id, 'meat').errors.some(e => e.startsWith(T.DIET_SOURCE_REQUIRED.split('{')[0])));
    assert.ok(run('черника лесная', id, 'berries_wild').errors.includes(T.DIET_NOT_SET));
});
test('запись и группа другого продукта при продукте с умолчанием — отказ GROUP_MISMATCH', () => {
    const id = pick('Говядина', 'default').rec.id;
    assert.ok(run('Картофель', id, 'meat').errors.includes(T.DIET_GROUP_MISMATCH));
    assert.ok(run('Картофель', id, 'potato').errors.includes(T.DIET_GROUP_MISMATCH));
    assert.ok(run('Картофель', pick('Картофель', 'default').rec.id, 'meat').errors.includes(T.DIET_GROUP_MISMATCH));
});
