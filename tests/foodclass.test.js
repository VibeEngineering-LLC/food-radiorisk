import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOD_CLASS_RU, foreignClasses, productClasses, appliesTo } from '../src/calc/foodclass.js';

const CASES = [
  ["Детское питание", ["infant"]],
  ["Детское питание (пищевые продукты, предназначенные для потребления младенцами)", ["infant"]],
  ["Пищевые продукты, кроме детского питания", ["general"]],
  ["Молочные продукты (коды КН 0401 и 0402, кроме 0402 29 11, сн. 3)", ["milk"]],
  ["Прочие продукты, кроме малозначимых (minor food, Annex II)", ["general"]],
  ["Жидкие продукты (позиция 2009 и глава 22 КН; значения рассчитаны с учётом водопроводной воды и могут применяться к питьевой воде по решению компетентных органов, сн. 5); единица в таблице -- Bq/kg", ["liquid"]],
  ["Малозначимые продукты питания", ["minor"]],
  ["Молоко и молочные продукты; продукты для младенцев и детей раннего возраста", ["infant", "milk"]],
  ["Все прочие продукты, попадающие в область регламента", ["general"]],
  ["Питьевая вода", ["water"]],
  ["Общие (прочие) пищевые продукты", ["general"]],
  ["Все пищевые продукты (без категории для младенцев)", ["general"]],
  ["Молоко (категория «牛乳»: молоко и молочные напитки по приказу о молоке и молочных продуктах; кисломолочные продукты, сыры сюда не входят)", ["milk"]],
  ["Прочие продукты", ["general"]],
  ["", []]
];

for (const [text, expected] of CASES) {
  test(`классы: ${text.slice(0, 40)}`, () => {
    assert.deepEqual(foreignClasses(text), expected);
  });
}

test("продукт: коды групп", () => {
  assert.deepEqual(productClasses("baby_food"), ["infant", "general"]);
  assert.deepEqual(productClasses("milk"), ["milk", "general"]);
  assert.deepEqual(productClasses("milk_products"), ["milk", "general"]);
  assert.deepEqual(productClasses("water"), ["water", "liquid"]);
  assert.deepEqual(productClasses("berries_wild"), ["general"]);
  assert.deepEqual(productClasses(null), ["general"]);
  assert.deepEqual(productClasses(""), ["general"]);
});

test("применимость: ягоды — только общие нормы", () => {
  assert.equal(appliesTo("Детское питание", "berries_wild"), false);
  assert.equal(appliesTo("Пищевые продукты, кроме детского питания", "berries_wild"), true);
  assert.equal(appliesTo("Молочные продукты", "berries_wild"), false);
});

test("применимость: молоко", () => {
  assert.equal(appliesTo("Молочные продукты", "milk"), true);
  assert.equal(appliesTo("Прочие продукты", "milk"), true); // #FR-81 E09: общие нормы к молоку применимы
});

test("подписи классов", () => {
  assert.equal(FOOD_CLASS_RU.general, "прочие пищевые продукты");
  assert.equal(Object.keys(FOOD_CLASS_RU).length, 6);
});
