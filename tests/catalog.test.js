import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { normRu, normCodeFor, limitRecordFor, dryMatterFor, processingMatches } from '../src/calc/catalog.js';
import { productEntry, matchProduct } from '../src/calc/products.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
// #FR-85: группа норм — группа строки норматива записи словаря продуктов (data.products), а не категория по основе слова
const ent = (name) => productEntry(data.products, name);
const key = (name, state = 'fresh') => normCodeFor(data.limits_ru, ent(name), state);
// #FR-85 v11: шифр пробы с лишними словами — «частично»; группа — после подтверждения предложенной записи (как в форме)
const keyConfirmed = (name) => { const m = matchProduct(data.products, name); assert.equal(m.status, 'partial', name); return normCodeFor(data.limits_ru, productEntry(data.products, name, m.entry.id), 'fresh'); };

test("группа норм по названию (боевые шифры ЛСРМ): словарь, целые слова", () => {
  const CASES = [
    ["черника лесная","berries_wild"],
    ["Черника лесная ОГО","berries_wild", true],
    ["Грузди","mushrooms_fresh"],
    ["белый гриб","mushrooms_fresh"],
    ["Маслята Каменск-Уральск","mushrooms_fresh", true],
    ["Оленье мясо","meat_game"],
    ["Сухое молоко Рогачев","milk_products", true],
    ["Водяника","berries_wild"],
    ["Вода Радонница",null], // #FR-85 v15: «вода» — вопрос (ch_voda), лишнее слово — «не распознан»
    ["Картошка Тула","vegetables", true],
    ["Бисер урановый",null],
    ["",null]
  ];
  for (const [name, expected, extra] of CASES) {
    if (extra) { assert.equal(key(name), null, name); assert.equal(keyConfirmed(name), expected, name); } else assert.equal(key(name), expected, name);
  }
});

test("группа норм по записи словаря и состоянию", () => {
  assert.equal(key("черника лесная"), "berries_wild");
  assert.equal(key("черника"), "berries_wild"); // #FR-85 v13 (D-024 Сверка 2, С8): «черника» без уточнения — дикорастущая
  assert.equal(key("Грузди", "dried"), "mushrooms_dried");
  assert.equal(key("Грузди"), "mushrooms_fresh");
  assert.equal(key("Сухое молоко", "dried"), "milk_products");
  assert.equal(normCodeFor(data.limits_ru, null, "fresh"), null);
});

test("запись нормы: сушёные ягоды — значение для сухого продукта", () => {
  assert.equal(limitRecordFor(data.limits_ru, "berries_wild", "Cs-137", "dried").value, 800);
  assert.equal(limitRecordFor(data.limits_ru, "berries_wild", "Cs-137", "fresh").value, 160);
  assert.equal(limitRecordFor(data.limits_ru, "vegetables", "Sr-90", "dried").value, 200);
  assert.equal(limitRecordFor(data.limits_ru, "berries_wild", "Sr-90", "fresh"), null);
});

test("сухое вещество из данных", () => {
  const dm1 = dryMatterFor(data.transfer, ent("черника лесная"));
  assert.equal(dm1.value, 13.2);
  assert.equal(dm1.min, 8.6);
  assert.equal(dm1.max, 21);
  assert.equal(dryMatterFor(data.transfer, ent("Брусника")).value, 14.1);
  assert.equal(dryMatterFor(data.transfer, ent("Грузди")).value, 10);
  assert.equal(dryMatterFor(data.transfer, ent("Бисер урановый")), null);
});

test("обработка по записи словаря", () => {
  const berries = ent("черника лесная");
  const fr = data.processing.filter(r => r.quantity === 'Fr');
  assert.ok(fr.filter(r => processingMatches(r, berries)).some(r => /Варка лесных ягод/.test(r.process_ru)));
  for (const r of fr) {
    if (/Молоко|Мышечная|Кости/.test(r.food)) {
      assert.ok(!processingMatches(r, berries), `Record ${r.id} should not match berries`);
    }
  }
  assert.equal(processingMatches(fr[0], null), true);
});

// #FR-54: для ягод — только записи про ягоды; виноград, маслины, овощи и лекарственные плоды не предлагаются
test("обработка ягод: без винограда, маслин, овощей и лекарственных плодов", () => {
  const fr = data.processing.filter(r => r.quantity === 'Fr');
  const berries = ent("черника лесная");
  const hit = fr.filter(r => processingMatches(r, berries));
  assert.ok(hit.length > 5);
  assert.ok(hit.every(r => /ягод|berr/i.test(`${r.food} ${r.process_ru} ${r.food_group}`)));
  assert.ok(!hit.some(r => /Grapes|Olives|medicinal|Виноград|Маслин|Плоды \(/.test(r.food)));
});

test("normRu", () => {
  assert.equal(normRu(" Ёж  "), "еж");
});
