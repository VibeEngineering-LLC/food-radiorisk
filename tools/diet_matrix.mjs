import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, extraJsonPath] = process.argv.slice(2);

const load = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const diet = load('public/data/diet.json');
const products = load('public/data/products.json').records; // #FR-85: словарь продуктов
const limits = load('public/data/limits_ru.json').records;
const transfer = load('public/data/transfer.json');

const recs = diet.records;
const choices = {
  transfer: transfer.records.filter(
    (r) => r.unit_norm === 'm2/kg' && (r.quantity === 'Tag' || r.quantity === 'KP')
  ),
};

const { dietGroupFor } = await import(pathToFileURL(join(root, 'src/calc/diet.js')).href);
const { normCodeFor } = await import(pathToFileURL(join(root, 'src/calc/catalog.js')).href);
const { matchProduct, productSuggestions } = await import(pathToFileURL(join(root, 'src/calc/products.js')).href);
const { productNames } = await import(pathToFileURL(join(root, 'src/ui/product.js')).href);
const { cleanProductNames } = await import(pathToFileURL(join(root, 'src/ui/suggest.js')).href);

const appNames = productSuggestions(products); // подсказки приложения — названия и синонимы словаря

// названия из прочих данных приложения (все записи переходов, продукты таблиц обработки): их человек тоже вводит в поле «Продукт»
const dataNames = cleanProductNames(
  productNames({ transfer: transfer.records }).concat(load('public/data/processing.json').records.map((r) => String(r.food || '').split(',')[0].trim()).filter((n) => /[а-яё]/i.test(n))),
  () => true, []);
let extraNames = [];
if (extraJsonPath) {
  const extraData = JSON.parse(readFileSync(extraJsonPath, 'utf8'));
  extraNames = (extraData.names || []).map((pair) => pair[0]);
}

const seen = new Set(appNames);
const allNames = appNames.map((name) => ({ name, src: 'app' }));
for (const name of dataNames) {
  if (!seen.has(name)) { seen.add(name); allNames.push({ name, src: 'data' }); }
}
for (const name of extraNames) {
  if (!seen.has(name)) {
    seen.add(name);
    allNames.push({ name, src: 'extra' });
  }
}

const rows = allNames.map(({ name, src }) => {
  const g = dietGroupFor(recs, name, products);
  const m = matchProduct(products, name);
  return {
    name,
    src,
    group: g ? g.code : null,
    status: g ? g.status : null,
    match: m.status,
    entry: m.entry ? m.entry.id : null,
    cat: normCodeFor(limits, m.entry, 'fresh'), // группа норм по строке норматива записи (прежде — ключ категории по основе)
  };
});

const appCount = appNames.length;
const obj = { count: rows.length, app: appCount, rows };
process.stdout.write(JSON.stringify(obj, null, 1));
process.exit(0);
