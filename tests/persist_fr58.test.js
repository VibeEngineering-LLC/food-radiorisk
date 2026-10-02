import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { STORAGE_KEY, SCHEMA_VERSION, serialize, restore, loadSaved, save } from '../src/react/persist.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const ch = listChoices(data);
const base = S.initialRaw(ch);
const names = ch.nuclides;
const edited = S.setField(S.setField(base, ch, 'product', 'черника'), ch, 'portionG', '250');

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } }; };

test('Круговой путь: restore(serialize(edited, 2), base, names) возвращает { raw: edited, tab: 2 }', () => {
    const result = restore(serialize(edited, 2), base, names);
    assert.deepEqual(result, { raw: edited, tab: 2 });
});

test('Мусорный ввод возвращает null для каждого из: null, пустая строка, неполный JSON и т.д.', () => {
    const garbageInputs = [
        null,
        '',
        '{',
        '[]',
        '42',
        JSON.stringify({ v: SCHEMA_VERSION + 1, tab: 0, raw: edited }),
        JSON.stringify({ v: SCHEMA_VERSION, tab: 0, raw: 'x' })
    ];
    for (const input of garbageInputs) {
        assert.equal(restore(input, base, names), null);
    }
});

test('Поле с несовпадающим типом падает до base: portionG число вместо строки', () => {
    const storedRaw = JSON.parse(JSON.stringify(edited));
    storedRaw.portionG = 250; // number instead of string
    const serialized = JSON.stringify({ v: SCHEMA_VERSION, tab: 0, raw: storedRaw });
    const result = restore(serialized, base, names);
    assert.equal(result.raw.portionG, base.portionG);
    assert.equal(result.raw.product, 'черника');
});

test('Неизвестные сохраненные ключи удаляются: extra key evil', () => {
    const storedRaw = JSON.parse(JSON.stringify(edited));
    storedRaw.evil = 'x';
    const serialized = JSON.stringify({ v: SCHEMA_VERSION, tab: 0, raw: storedRaw });
    const result = restore(serialized, base, names);
    assert.equal(result.raw.hasOwnProperty('evil'), false);
});

test('Нуклиды: элемент с именем не в names удаляется; если все удалены, результат как base.nuclides', () => {
    // Test 1: Invalid name dropped
    const storedRaw1 = JSON.parse(JSON.stringify(edited));
    storedRaw1.nuclides = [{ ...base.nuclides[0], nuclide: 'invalid_name', measured: '10' }];
    const serialized1 = JSON.stringify({ v: SCHEMA_VERSION, tab: 0, raw: storedRaw1 });
    const result1 = restore(serialized1, base, names);
    assert.deepEqual(result1.raw.nuclides, base.nuclides);

    // Test 2: Valid item kept
    const validName = names[0];
    const storedRaw2 = JSON.parse(JSON.stringify(edited));
    storedRaw2.nuclides = [{ ...base.nuclides[0], nuclide: validName, measured: '123' }];
    const serialized2 = JSON.stringify({ v: SCHEMA_VERSION, tab: 0, raw: storedRaw2 });
    const result2 = restore(serialized2, base, names);
    assert.equal(result2.raw.nuclides[0].measured, '123');

    // Test 3: More than 20 items cut to 20
    const storedRaw3 = JSON.parse(JSON.stringify(edited));
    const manyItems = Array.from({ length: 25 }, (_, i) => ({ ...base.nuclides[0], nuclide: validName, measured: String(i) }));
    storedRaw3.nuclides = manyItems;
    const serialized3 = JSON.stringify({ v: SCHEMA_VERSION, tab: 0, raw: storedRaw3 });
    const result3 = restore(serialized3, base, names);
    assert.equal(result3.raw.nuclides.length, 20);
});

test('Вкладка: tab 7, -1, 1.5, "a" дают 0; tab 1 дает 1', () => {
    const invalidTabs = [7, -1, 1.5, 'a'];
    for (const t of invalidTabs) {
        const serialized = JSON.stringify({ v: SCHEMA_VERSION, tab: t, raw: edited });
        const result = restore(serialized, base, names);
        assert.equal(result.tab, 0);
    }
    
    const serializedValid = JSON.stringify({ v: SCHEMA_VERSION, tab: 1, raw: edited });
    const resultValid = restore(serializedValid, base, names);
    assert.equal(resultValid.tab, 1);
});

test('Строка длиннее 200 символов в строковом поле падает до значения base', () => {
    const longString = 'a'.repeat(201);
    const storedRaw = JSON.parse(JSON.stringify(edited));
    storedRaw.product = longString;
    const serialized = JSON.stringify({ v: SCHEMA_VERSION, tab: 0, raw: storedRaw });
    const result = restore(serialized, base, names);
    assert.equal(result.raw.product, base.product);
});

test('save + loadSaved с mem(): save возвращает true, loadSaved возвращает те же raw и tab', () => {
    const storage = mem();
    const success = save(storage, edited, 2);
    assert.equal(success, true);
    
    const loaded = loadSaved(storage, base, names);
    assert.deepEqual(loaded.raw, edited);
    assert.equal(loaded.tab, 2);
    
    // Check key
    assert.ok(storage.getItem(STORAGE_KEY) !== null);
});

test('save(undefined, ...) возвращает false; save с выбрасывающим setItem возвращает false; loadSaved(undefined, ...) возвращает null; loadSaved с выбрасывающим getItem возвращает null', () => {
    assert.equal(save(undefined, edited, 0), false);
    
    const throwingStorage = {
        getItem: () => null,
        setItem: () => { throw new Error('fail'); }
    };
    assert.equal(save(throwingStorage, edited, 0), false);
    
    assert.equal(loadSaved(undefined, base, names), null);
    
    const throwingLoadStorage = {
        getItem: () => { throw new Error('fail'); },
        setItem: () => {}
    };
    assert.equal(loadSaved(throwingLoadStorage, base, names), null);
});

test('Аргументы не мутируются: JSON.stringify(base) одинаков до и после restore', () => {
    const before = JSON.stringify(base);
    restore(serialize(edited, 2), base, names);
    const after = JSON.stringify(base);
    assert.equal(before, after);
});
