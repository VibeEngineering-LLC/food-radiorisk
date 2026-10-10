// #FR-83 W05: сохранение — состояние, сохранённое до режимов рациона, восстанавливается как «знаю» (own)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { restore, serialize } from '../src/react/persist.js';

const ch = listChoices(data);
const base = S.initialRaw(ch);

test('сохранение без ключа dietMode (до умолчаний): масса не 100 г — own и масса сохраняется (В7)', () => {
    const old = { ...base, portionG: '150' };
    delete old.dietMode;
    const back = restore(serialize(old, 1), base, ch.nuclides);
    assert.equal(back.raw.dietMode, 'own');
    assert.equal(back.raw.portionG, '150');
    // неизвестный режим в хранилище тоже заменяется на own
    assert.equal(restore(serialize({ ...base, dietMode: 'xyz' }, 0), base, ch.nuclides).raw.dietMode, 'own');
});

test('сохранение без ключа dietMode с массой ровно 100 г (прежняя заглушка) — режим default, масса пустая (В7)', () => {
    const old = { ...base, portionG: '100' };
    delete old.dietMode;
    const back = restore(serialize(old, 1), base, ch.nuclides);
    assert.equal(back.raw.dietMode, 'default');
    assert.equal(back.raw.portionG, '');
});

test('сохранённый режим high возвращается как есть', () => {
    const back = restore(serialize({ ...base, dietMode: 'high' }, 0), base, ch.nuclides);
    assert.equal(back.raw.dietMode, 'high');
});
