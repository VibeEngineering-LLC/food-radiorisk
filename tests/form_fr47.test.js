import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { listChoices } from '../src/calc/model.js';
import { transferOptions } from '../src/ui/product.js';
import { summaryOffered } from '../src/ui/form.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const choices = listChoices(data);
const count = (o) => o.groups.reduce((s, g) => s + g.items.length, 0);

test("сводная предлагается только при введённом продукте и совпавших записях", () => {
    assert.equal(summaryOffered(9, false, 'черника'), true);
    assert.equal(summaryOffered(9, false, ''), false);
    assert.equal(summaryOffered(9, false, '   '), false);
    assert.equal(summaryOffered(9, true, 'черника'), false);
    assert.equal(summaryOffered(0, false, 'черника'), false);
    assert.equal(summaryOffered(9, false, undefined), false);
});

test("записи сводной — только выбранный продукт: для черники меньше, чем для пустого поля", () => {
    const all = transferOptions(choices, 'Cs-137', '');
    const bil = transferOptions(choices, 'Cs-137', 'черника лесная'); // #FR-85 v11: «черника» без уточнения — выбор садовая/лесная
    assert.ok(count(bil) > 0 && count(bil) < count(all) / 5, `${count(bil)} из ${count(all)}`);
});
