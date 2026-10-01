import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { normRu, stemOf, CATEGORIES, categoryOf, limitGroupFor, limitRecordFor, dryMatterFor, processingMatches } from '../src/calc/catalog.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const key = (name) => categoryOf(name)?.key ?? null;

test("категория по названию (боевые шифры ЛСРМ)", () => {
  const CASES = [
    ["черника","berries"],
    ["Черника ОГО","berries"],
    ["Грузди","mushrooms"],
    ["белый гриб","mushrooms"],
    ["Маслята Каменск-Уральск","mushrooms"],
    ["Оленье мясо","game"],
    ["Сухое молоко Рогачев","milk"],
    ["Водяника","berries"],
    ["Вода Радонница","water"],
    ["Картошка Тула","vegetables"],
    ["Бисер урановый",null],
    ["",null]
  ];
  for (const [name, expected] of CASES) {
    assert.equal(key(name), expected, name);
  }
});

test("основа слова без слов состояния", () => {
  assert.equal(stemOf("Сухое молоко Рогачев"), "моло");
  assert.equal(stemOf("Голубика сушеная"), "голуби");
  assert.equal(stemOf("ОГО"), "");
});

test("группа норм по категории и состоянию", () => {
  assert.equal(limitGroupFor(categoryOf("черника"), "fresh"), "berries_wild");
  assert.equal(limitGroupFor(categoryOf("Грузди"), "dried"), "mushrooms_dried");
  assert.equal(limitGroupFor(categoryOf("Грузди"), "fresh"), "mushrooms_fresh");
  assert.equal(limitGroupFor(categoryOf("Сухое молоко"), "dried"), "milk_products");
  assert.equal(limitGroupFor(null, "fresh"), null);
});

test("запись нормы: сушёные ягоды — значение для сухого продукта", () => {
  assert.equal(limitRecordFor(data.limits_ru, "berries_wild", "Cs-137", "dried").value, 800);
  assert.equal(limitRecordFor(data.limits_ru, "berries_wild", "Cs-137", "fresh").value, 160);
  assert.equal(limitRecordFor(data.limits_ru, "vegetables", "Sr-90", "dried").value, 200);
  assert.equal(limitRecordFor(data.limits_ru, "berries_wild", "Sr-90", "fresh"), null);
});

test("сухое вещество из данных", () => {
  const dm1 = dryMatterFor(data.transfer, "черника");
  assert.equal(dm1.value, 13.2);
  assert.equal(dm1.min, 8.6);
  assert.equal(dm1.max, 21);
  assert.equal(dryMatterFor(data.transfer, "Брусника Беларусь").value, 14.1);
  assert.equal(dryMatterFor(data.transfer, "Грузди").value, 10);
  assert.equal(dryMatterFor(data.transfer, "Бисер урановый"), null);
});

test("обработка по категории", () => {
  const berries = categoryOf("черника");
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
  const berries = categoryOf("черника");
  const hit = fr.filter(r => processingMatches(r, berries));
  assert.ok(hit.length > 5);
  assert.ok(hit.every(r => /ягод|berr/i.test(`${r.food} ${r.process_ru} ${r.food_group}`)));
  assert.ok(!hit.some(r => /Grapes|Olives|medicinal|Виноград|Маслин|Плоды \(/.test(r.food)));
});

test("порядок категорий", () => {
  assert.deepStrictEqual(CATEGORIES.map(c => c.key), ["berries","mushrooms","game","meat","fish","milk","vegetables","cereals","bread","water","herbal"]);
  assert.equal(normRu(" Ёж  "), "еж");
});
