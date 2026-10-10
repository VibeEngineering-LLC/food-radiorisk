// #FR-86 (D-024): коэффициенты перехода продукта — только явные ключи записи словаря; без ключей — весь список с пометкой, а не чужие КП как совпадение
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import { transferOptions } from '../src/ui/product.js';
import { transferHint } from '../src/ui/form.js';

const choices = listChoices(data);
const ids = (o) => o.groups.flatMap((g) => g.items.map((i) => i.id));
const rec = (id) => choices.transfer.find((r) => r.id === id);
const cs = choices.transfer.filter((r) => r.nuclide.startsWith('Cs'));

test('сыр, горох, масло подсолнечное, чай чёрный, мясо краба — ни одного чужого КП: весь список с пометкой «ключей нет»', () => {
  for (const n of ['сыр', 'горох', 'масло подсолнечное', 'чай чёрный', 'мясо краба']) {
    const o = transferOptions(choices, 'Cs-137', n);
    assert.equal(o.fallback, true, n);
    assert.equal(o.reason, 'no_keys');
    assert.equal(o.matched, 0);
    assert.equal(ids(o).length, cs.length);
  }
});

test('подпись списка без ключей: «коэффициентов перехода в словаре нет», выбор — на усмотрение', () => {
  const o = transferOptions(choices, 'Cs-137', 'сыр');
  assert.match(transferHint(o, 'сыр'), /коэффициентов перехода в словаре нет/);
  const u = transferOptions(choices, 'Cs-137', 'абракадабра');
  assert.equal(u.fallback, true);
  assert.equal(u.reason, 'unknown');
  assert.match(transferHint(u, 'абракадабра'), /не распознан/);
});

test('черника и сыроежки — только свои записи', () => {
  const b = transferOptions(choices, 'Cs-137', 'черника лесная'); // #FR-85 v11: «черника» без уточнения — выбор
  assert.equal(b.fallback, false);
  assert.ok(b.matched > 5);
  for (const id of ids(b)) {
    assert.match(rec(id).item_ru, /черник/i);
  }
  const s = transferOptions(choices, 'Cs-137', 'сыроежки');
  assert.equal(s.fallback, false);
  for (const id of ids(s)) {
    assert.match(rec(id).item_ru, /сыроеж/i);
  }
});

test('каждый ключ КП записи словаря — существующая запись данных той же группы продуктов', () => {
  const groupOf = new Map(data.transfer.map((r) => [r.item_ru, r.food_group]));
  for (const e of data.products.filter((p) => p.kind === 'product')) {
    for (const t of e.transfer) {
      assert.ok(groupOf.has(t), e.id + ': ' + t);
    }
    if (e.transfer.length > 0) {
      const groups = new Set(e.transfer.map((t) => groupOf.get(t)));
      const families = [
        ['mushrooms'],
        ['berries_wild', 'berries'],
        ['game', 'meat'],
        ['milk'],
        ['medicinal_plants'], // #FR-85 v11 (A 2.4.2): лекарственное растительное сырьё — свой ключ CR
        ['other']
      ];
      const ok = families.some((fam) => {
        const famSet = new Set(fam);
        return groups.size > 0 && [...groups].every((g) => famSet.has(g));
      });
      assert.ok(ok, e.id);
    }
  }
});
