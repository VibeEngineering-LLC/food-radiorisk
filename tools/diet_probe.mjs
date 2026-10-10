// #FR-83 W10: зонд — результаты dietDefaultFor на фиксированном наборе входов (для сравнения исправной и дефектной версий); печатает JSON {метка: строка-результат}
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const { dietDefaultFor } = await import(pathToFileURL(path.join(root, 'src/calc/diet.js')).href);
const recs = JSON.parse(readFileSync(path.join(root, 'public/data/diet.json'), 'utf8')).records;
const products = JSON.parse(readFileSync(path.join(root, 'public/data/products.json'), 'utf8')).records; // #FR-85: словарь продуктов

const NAMES = ['Молоко','Молоко сухое','Творог','Сыр','Говядина','Свинина','Картофель','Морковь','Капуста','Свёкла','Хлеб','Мука пшеничная','Крупа гречневая','Рыба речная','Вода питьевая','Чай травяной','черника','Белые грибы','Лосятина','Яблоки','Малина садовая','малина','Колбаса варёная','Масло подсолнечное','Масло сливочное','Майонез','Сало','Яйца куриные','Горох','Арбуз','Сёмга','Окунь морской','Окунь','Детское питание','сахар'];

const base = { productName: 'Картофель', state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products };

const probes = [];

// Продукты x режимы
for (const name of NAMES) {
  for (const mode of ['default', 'high']) {
    probes.push([`${name}/режим:${mode}`, { ...base, productName: name, mode }]);
  }
}

// Возрасты
for (const age of ['3m','1y','1-2y','5y','10y','12-17y','15y']) {
  probes.push([`возраст:${age}`, { ...base, age }]);
}

// Lifetime
const lifetimes = [
  {fromAge:5,toAge:70},
  {fromAge:16,toAge:70},
  {fromAge:17,toAge:70},
  {fromAge:null,toAge:70}
];
for (const lifetime of lifetimes) {
  probes.push([`с возраста:${lifetime.fromAge}`, { ...base, lifetime }]);
}

// Состояния
for (const state of ['dried','cooked','fresh','']) {
  probes.push([`состояние:${state}`, { ...base, state }]);
}

const out = {};
for (const [label, args] of probes) {
  try {
    const r = dietDefaultFor(recs, args);
    out[label] = JSON.stringify([
      r.status,
      r.reason,
      r.group ? r.group.code : null,
      r.rec ? r.rec.id : null,
      r.base ? r.base.id : null,
      r.ref614 ? r.ref614.id : null
    ]);
  } catch (e) {
    out[label] = 'ERR:' + e.message;
  }
}

process.stdout.write(JSON.stringify(out));
