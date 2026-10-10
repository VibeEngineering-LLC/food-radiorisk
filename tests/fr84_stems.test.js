// #FR-84: ложные совпадения основ каталога и групп рациона; по тесту на каждое исключение.
// #FR-85: механизм основ заменён словарём продуктов; категория — по строке норматива записи словаря. Отличия от ожиданий #FR-84 — в DEV с причиной.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { normCodeFor } from '../src/calc/catalog.js';
import { productEntry } from '../src/calc/products.js';
import { dietGroupFor } from '../src/calc/diet.js';

const KEY = { oilseeds: 'oilseeds', berries_wild: 'berries', mushrooms_fresh: 'mushrooms', meat_game: 'game', meat: 'meat', fish: 'fish', baby_food: 'baby', milk: 'milk', milk_products: 'milk', fats_oils: 'fats', vegetables: 'vegetables', bread: 'bread', cereals: 'cereals', water: 'water', pulses: 'pulses' };
const cat = (n) => { const e = productEntry(data.products, n); const c = normCodeFor(data.limits_ru, e, 'fresh'); return c ? KEY[c] : e?.diet.group === 'herbal' ? 'herbal' : null; };
// ожидания #FR-84, изменённые решениями D-024 или исправлением ложного совпадения основы: [категория, группа рациона, причина]
const DEV = {
  'окорок сыровяленый': ['meat', 'meat_products', 'исправление: мясное изделие, п. 1'], 'окорок сырокопчёный': ['meat', 'meat_products', 'исправление: мясное изделие, п. 1'],
  'бобы': ['pulses', 'legumes', 'D-024 С3'], 'горошек зелёный': ['vegetables', 'vegetables', 'D-024 Сверка 2, С6: горошек зелёный — п. 13 «Овощи»'],
  'икра зернистая': ['fish', 'fish', 'D-024 С1 (рыбные продукты)'],
  'мясо краба': ['fish', 'fish', 'D-024 С1'], 'мясо кальмара': ['fish', 'fish', 'D-024 С1'], 'мясо устриц': ['fish', 'fish', 'D-024 С1'], 'мясо осьминога': ['fish', 'fish', 'D-024 С1'], 'мясо мидии': ['fish', 'fish', 'D-024 С1'],
  'крем масляный': [null, 'other', 'исправление: кондитерский крем — не растительное масло п. 20'],
  'красный перец': [null, 'other', '#FR-85 v11 (A 4.1): выбор сладкий / чили / молотая специя'], 'греческий йогурт': [null, 'other', '#FR-85 v11 (B № 17): «греческий» не покрыто — «частично»'],
  'земляной орех': ['oilseeds', 'other', '#FR-85 v11 (A 1.4): арахис — ТР ТС 015 масличные (справочно)'], 'кукуруза отварная': ['cereals', 'other', '#FR-85 v11 (A 1.3): кукуруза — ТР ТС 015 злаковые (справочно)'],
  
  'карп': ['fish', 'fish_river', 'D-024 С1'], 'сом': ['fish', 'fish_river', 'D-024 С1'],
  'каша молочная рисовая': [null, 'other', '#FR-85 v14 п. 6 (D-025 п. 2): блюдо — не распознан'], 'карпаччо из говядины': [null, 'other', '#FR-85 v14 п. 6 (D-025 п. 2): блюдо — не распознан'],
  'шпикачки': ['meat', 'meat_products', 'исправление: мясное изделие, п. 1'], 'шпик': ['meat', 'lard', 'D-024 С2'], 'гусь': ['meat', 'meat', 'D-024 С1'],
};
const grp = (n) => dietGroupFor(data.diet, n, data.products)?.code ?? 'other'; // #FR-85: null — запись словаря без группы рациона (не установлено), как other

const CASES = [
{ title: 'сельдерей — не сельдь (основа «сельд»)', rows: [['сельдерей', 'vegetables', 'vegetables'], ['стебель сельдерея', 'vegetables', 'vegetables'], ['сельдь солёная', 'fish', 'fish']] },
{ title: 'лещина — не лещ (категория каталога)', rows: [['лещина', null, 'other'], ['орех лещина', null, 'other'], ['лещ вяленый', 'fish', 'fish_river']] },
{ title: 'сырьё — не сыр', rows: [['сырьё растительного происхождения', null, 'other'], ['сырьё лекарственное', 'herbal', 'herbal'], ['сыр плавленый', 'milk', 'milk_concentrates']] },
{ title: 'сыровяленый и сырокопчёный окорок — не сыр', rows: [['окорок сыровяленый', null, 'other'], ['окорок сырокопчёный', null, 'other'], ['колбаса сырокопчёная', 'meat', 'meat_products']] },
{ title: 'растительные «молоки» — не молоко и не зерно', rows: [['соевое молоко', null, 'other'], ['кокосовое молоко', null, 'other'], ['миндальное молоко', null, 'other'], ['рисовое молоко', null, 'other'], ['овсяное молоко', null, 'other'], ['молоко кокосовое', null, 'other'], ['молоко козье', 'milk', 'milk'], ['каша молочная рисовая', 'milk', 'milk']] },
{ title: 'морская капуста — не овощ', rows: [['морская капуста', null, 'other'], ['капуста белокочанная', 'vegetables', 'vegetables']] },
{ title: 'лукум — не лук', rows: [['рахат-лукум', null, 'other'], ['лук репчатый', 'vegetables', 'vegetables']] },
{ title: 'свекловичный сахар — не овощ', rows: [['сахар свекловичный', null, 'other'], ['свекловичный сахар', null, 'other'], ['сахарная свёкла', 'vegetables', 'vegetables'], ['свёкла столовая', 'vegetables', 'vegetables']] },
{ title: 'семена и семечки тыквы — не овощ', rows: [['семена тыквы', null, 'other'], ['семечки тыквенные', null, 'other'], ['тыква', 'vegetables', 'vegetables']] },
{ title: 'перец-пряность — не овощ', rows: [['перец молотый', null, 'other'], ['перец горошком', null], ['чёрный перец', null, 'other'], ['перец чёрный', null, 'other'], ['душистый перец', null, 'other'], ['перец болгарский', 'vegetables', 'vegetables'], ['красный перец', 'vegetables', 'vegetables']] },
{ title: 'перец горошком — не бобовое', rows: [['перец душистый горошком', null, 'other'], ['горошек зелёный', null, 'legumes']] },
{ title: 'какао-бобы и кофейные бобы — не бобовые', rows: [['какао-бобы', null, 'other'], ['кофейные бобы', null, 'other'], ['бобы', null, 'legumes']] },
{ title: 'батончик — не батон', rows: [['батончик шоколадный', null, 'other'], ['батончик мюсли', null, 'other'], ['батон нарезной', 'bread', 'bread']] },
{ title: 'крупный, греческий, зернистая икра, кофе в зёрнах, гречневый мёд — не крупа', rows: [['крупнолистовой чай', 'herbal', 'herbal'], ['греческий орех', null, 'other'], ['икра зернистая', null, 'other'], ['кофе в зёрнах', null, 'other'], ['мёд гречневый', null, 'other'], ['крупа гречневая', 'cereals', 'cereals'], ['греческий йогурт', 'milk', 'milk']] },
{ title: 'яйца — не мясо', rows: [['яйца куриные', null, 'eggs'], ['яиц куриных', null, 'eggs'], ['мясо птицы', 'meat', 'meat']] },
{ title: 'мясо краба, рыбы, морепродуктов — не мясо', rows: [['мясо краба', null, 'fish'], ['мясо кальмара', null, 'fish'], ['мясо устриц', null, 'fish'], ['мясо осьминога', null, 'fish'], ['мясо мидии', null, 'fish'], ['мясо креветки', 'fish', 'fish'], ['мясо рыбы', 'fish', 'fish'], ['мясо птицы', 'meat', 'meat']] },
{ title: 'масляный крем — не гриб', rows: [['крем масляный', 'fats', 'oil'], ['маслята', 'mushrooms', 'mushrooms'], ['маслёнок', 'mushrooms', 'mushrooms']] },
{ title: 'рыжиковое масло — не рыжик', rows: [['масло рыжиковое', 'fats', 'oil'], ['рыжики', 'mushrooms', 'mushrooms']] },
{ title: 'чайный гриб — не гриб', rows: [['чайный гриб', 'herbal', 'herbal'], ['белые грибы', 'mushrooms', 'mushrooms']] },
{ title: 'земляной орех — не земляника', rows: [['земляной орех', null, 'other'], ['земляника', 'berries', 'berries_wild']] },
{ title: 'ягодный йогурт и морс — не дикорастущие ягоды и не фрукты', rows: [['ягодный йогурт', 'milk', 'milk'], ['йогурт ягодный', 'milk', 'milk'], ['ягодный морс', null, 'other'], ['брусника', 'berries', 'berries_wild']] },
{ title: 'маслины — не масло', rows: [['маслины', null, 'other'], ['масло оливковое', 'fats', 'oil']] },
{ title: 'кокосовая вода — не питьевая вода', rows: [['кокосовая вода', null, 'other'], ['вода питьевая бутилированная', 'water', 'water']] },
{ title: 'отварной — не отвар', rows: [['кукуруза отварная', null, 'other'], ['яйца отварные', null, 'eggs'], ['отвар трав', 'herbal', 'herbal']] },
{ title: 'сомелье, карпатский, карпаччо — не речная рыба', rows: [['сомелье', null, 'other'], ['чай карпатский травяной', 'herbal', 'herbal'], ['карпаччо из говядины', 'meat', 'meat'], ['карп', null, 'fish_river'], ['сом', null, 'fish_river']] },
{ title: 'шпикачки — не сало', rows: [['шпикачки', null, 'meat_products'], ['шпик', null, 'lard']] },
{ title: 'лимонад, лимонник, лимонная кислота, земляная груша — не фрукты', rows: [['лимонад', null, 'other'], ['лимонник', null, 'other'], ['лимонная кислота', null, 'other'], ['груша земляная дикая', null, 'other'], ['лимон', null, 'fruit']] },
{ title: 'густой, гусарский — не гусь', rows: [['кисель густой', null, 'other'], ['гусарский салат', null, 'other'], ['гусь', null, 'meat']] },
];

for (const c of CASES) test(c.title, () => { for (const [n, k0, g0] of c.rows) { const [k, g] = DEV[n] ?? [k0, g0]; assert.equal(cat(n), k, 'категория: ' + n); if (g0 !== undefined) assert.equal(grp(n), g, 'группа рациона: ' + n); } });
test('#FR-85: каждое отличие от ожиданий #FR-84 действительно отличается и названо в таблице', () => {
  const rows = new Map(CASES.flatMap(c => c.rows).map(([n, k, g]) => [n, [k, g]]));
  for (const [n, [k, g]] of Object.entries(DEV)) { const [k0, g0] = rows.get(n); assert.ok(k !== k0 || g !== g0, n); }
});
