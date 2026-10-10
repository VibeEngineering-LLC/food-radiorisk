// #FR-85 (D-024): словарь продуктов data-src/products.yaml и сопоставление названия (спека §2, §3, §5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { matchProduct, normalizeName, wordsOf, keyOf, productSuggestions, normIdFor, productEntry } from '../src/calc/products.js';
import { normCodeFor } from '../src/calc/catalog.js';
import { dietDefaultFor, checkDietInput } from '../src/calc/diet.js';
import { listChoices } from '../src/calc/model.js';
import { productView, setField } from '../src/react/formState.js';

const P = data.products;
const products = P.filter((r) => r.kind === 'product');
const mods = new Set(P.filter((r) => r.kind === 'modifier').flatMap((r) => r.words));
const m = (n) => matchProduct(P, n);
const id = (n) => m(n).entry?.id ?? null;
const code = (n, st = 'fresh') => normCodeFor(data.limits_ru, m(n).entry, st);

test('каждый синоним каждой записи находит свою запись (спека §5)', () => {
  assert.ok(products.length > 350);
  for (const e of products) {
    for (const s of e.synonyms) {
      const r = m(s);
      assert.equal(r.status, 'ok', s);
      assert.equal(r.entry.id, e.id, s);
    }
  }
});

test('синонимы нормализованы, ключи не повторяются, модификатор — только у записей с флагом', () => {
  const seen = new Map();
  for (const e of products) {
    for (const s of e.synonyms) {
      assert.equal(normalizeName(s), s, s);
      const k = keyOf(wordsOf(s));
      if (seen.has(k)) {
        assert.fail(`duplicate key: ${k}`);
      }
      seen.set(k, e.id);
      if (wordsOf(s).some((w) => mods.has(w))) {
        assert.equal(e.modifiers_change_product, true, s);
      }
    }
  }
});

test('модификатор состояния снимается и задаёт состояние; порядок слов и ё не важны', () => {
  assert.equal(id('Грузди сушёные'), id('грузди'));
  assert.equal(m('Грузди сушёные').state, 'dried');
  assert.equal(m('сырой картофель').state, 'fresh');
  assert.equal(id('сырой картофель'), id('картофель'));
  assert.equal(m('Картофель отварной').state, 'cooked');
  assert.equal(id('пшеничная мука'), id('мука пшеничная'));
  assert.equal(id('Свёкла'), id('свекла'));
  assert.ok(id('Молоко сухое'));
  assert.notEqual(id('Молоко сухое'), id('Молоко'));
  assert.equal(id('сухое молоко'), id('молоко сухое'));
  assert.equal(code('Молоко сухое', 'dried'), 'milk_products');
});

// #FR-85 v11 (B № 17): лишние слова не принимаются молча — «частично», предложена запись самого длинного совпадения, непокрытые слова названы
test('лишние слова: «частично» с предложенной записью и списком неучтённых слов (шифры проб)', () => {
  for (const [n, want, rest] of [['Черника лесная ОГО', 'черника лесная', ['ого']], ['Сухое молоко Рогачев', 'молоко сухое', ['рогачев']], ['Рыба речная из Оки', 'рыба речная', ['оки']], ['Маслята Каменск-Уральск', 'маслята', ['каменск', 'уральск']]]) {
    const r = m(n);
    assert.equal(r.status, 'partial', n);
    assert.equal(r.entry.id, id(want), n);
    assert.deepEqual(r.uncovered, rest, n);
    assert.equal(productEntry(P, n), null, n);
    assert.equal(productEntry(P, n, id(want)), r.entry, n);
  }
});

test('целые слова по основам Snowball: нет подстрок и начала слова; падежи — по основе', () => {
  assert.notEqual(id('сыр'), id('сыроежка'));
  assert.equal(code('сыр'), 'milk_products');
  assert.equal(code('сыроежка'), 'mushrooms_fresh');
  assert.equal(m('Черникой').entry.id, 'p_chernika'); // падеж узнан; v13: «черника» без уточнения — дикорастущая
  assert.equal(m('абракадабра').status, 'unknown');
  assert.equal(m('').status, 'empty');
  assert.equal(m('масло').status, 'unknown');
});

test('ложные совпадения основ #FR-84: своя запись, а не чужая', () => {
  const table = [
    ['сельдерей', 'vegetables'],
    ['лещина', null],
    ['сырьё растительного происхождения', null],
    ['мясо краба', 'fish'],
    ['маслины', null],
    ['рахат-лукум', null],
    ['сахар свекловичный', null],
    ['крем масляный', null],
    ['чайный гриб', null],
    ['кокосовая вода', null],
    ['земляной орех', 'oilseeds'] // #FR-85 v11 (A 1.4): арахис — ТР ТС 015 масличные
  ];
  for (const [n, want] of table) {
    assert.equal(m(n).status, 'ok', n);
    assert.equal(code(n), want, n);
  }
});

test('неоднозначность: два кандидата равной длины из разных записей — ambiguous без выбора первого', () => {
  const R = [
    { id: 'a', kind: 'product', name_ru: 'Масло сливочное', synonyms: ['масло сливочное'] },
    { id: 'b', kind: 'product', name_ru: 'Масло подсолнечное', synonyms: ['масло подсолнечное'] }
  ];
  const r = matchProduct(R, 'масло сливочное подсолнечное');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.entry, null);
  assert.deepEqual(r.candidates.map((e) => e.id), ['a', 'b']);
});

test('D-024: решения С1–С4 в словаре', () => {
  assert.equal(code('курица'), 'meat');
  assert.equal(code('кролик'), 'meat');
  assert.equal(code('сало'), 'meat');
  assert.equal(code('кальмар'), 'fish');
  assert.equal(code('карп'), 'fish');
  assert.equal(code('сливки'), 'milk');
  assert.equal(code('ряженка'), 'milk');
  assert.equal(normIdFor(m('яблоко').entry, 'fresh'), null);
  assert.deepEqual(m('яблоко').entry.codex, ['general']);
  assert.equal(normIdFor(m('Яйцо куриное').entry, 'fresh'), null);
  assert.equal(code('горох'), 'pulses');
  assert.match(m('горох').entry.note, /зерно, не на пищевой продукт/);
  assert.equal(code('лисичка'), 'mushrooms_fresh');
  assert.equal(code('Сморчок'), 'mushrooms_fresh');
  assert.equal(m('Берёза').status, 'unknown');
  assert.notEqual(m('Силос из трав').status, 'ok'); // #FR-85 v11: «силос» не покрыт словарём — «частично» (по слову «трав»), не молча
});

test('подсказки — все записи словаря, с нормативом и без (спека §2.4)', () => {
  const s = productSuggestions(P);
  assert.ok(s.includes('Яйцо куриное'));
  assert.ok(s.includes('Сырьё растительного происхождения'));
  assert.ok(s.includes('Молоко'));
  assert.ok(s.length >= products.length);
  assert.ok(!s.includes('Берёза'));
});

test('не распознан: группа рациона выбирается вручную и сверяется ядром; в результате — пометка', () => {
  const base = { productName: 'абракадабра', state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products: P };
  const d0 = dietDefaultFor(data.diet, base);
  assert.equal(d0.group.code, 'other');
  assert.equal(d0.status, 'not_established');

  const d1 = dietDefaultFor(data.diet, { ...base, manualGroup: 'vegetables' });
  assert.equal(d1.status, 'default');
  assert.equal(d1.group.code, 'vegetables');
  assert.equal(d1.manual, true);
  assert.equal(d1.group.direction, 'upper');
  // группа с рядом ровно для основы учёта (картофель, direction: match), выбранная вручную, — только оценка сверху
  assert.equal(dietDefaultFor(data.diet, { ...base, manualGroup: 'potato' }).group.direction, 'upper');

  assert.equal(dietDefaultFor(data.diet, { ...base, productName: 'картофель', manualGroup: 'vegetables' }).group.code, 'potato');

  const input = {
    age: 'adult',
    lifetime: null,
    portionKg: d1.rec.value,
    portionsPerYear: 1,
    product: { name: 'абракадабра', state: 'fresh', dietGroup: 'vegetables' },
    diet: { mode: 'default', id: d1.rec.id, group: 'vegetables' }
  };
  const ck = checkDietInput(data.diet, input, P);
  assert.deepEqual(ck.errors, []);
  assert.equal(ck.manual, true);

  assert.ok(checkDietInput(data.diet, { ...input, product: { name: 'абракадабра', state: 'fresh' } }, P).errors.length > 0);
});

test('форма: блок «не распознан» — список групп рациона; «неоднозначно» — кандидаты; распознанный — пусто', () => {
  const choices = listChoices(data);
  const raw = { product: 'абракадабра', dietGroup: '' };
  const v = productView(raw, choices);
  assert.equal(v.status, 'unknown');
  assert.match(v.text, /не найден в словаре/);
  assert.ok(v.groups.some((g) => g.value === 'vegetables'));
  assert.ok(!v.groups.some((g) => g.value === 'other'));

  assert.equal(productView({ product: 'черника лесная', dietGroup: '' }, choices).status, 'ok');
  assert.deepEqual(productView({ product: 'черника лесная', dietGroup: '' }, choices).groups, []);
  // #FR-85 v11 (решение оркестратора): «черника» без уточнения — выбор «садовая» / «дикорастущая (лесная)»
  assert.deepEqual(productView({ product: 'клубника', dietGroup: '' }, choices).candidates, ['Клубника садовая', 'Клубника дикорастущая (лесная)']);

  const ch2 = {
    ...choices,
    products: [
      { id: 'a', kind: 'product', name_ru: 'Масло сливочное', synonyms: ['масло сливочное'] },
      { id: 'b', kind: 'product', name_ru: 'Масло подсолнечное', synonyms: ['масло подсолнечное'] }
    ]
  };
  const va = productView({ product: 'масло сливочное подсолнечное', dietGroup: '' }, ch2);
  assert.equal(va.status, 'ambiguous');
  assert.deepEqual(va.candidates, ['Масло сливочное', 'Масло подсолнечное']);
});

// D-024 С3: бобовые — норма ТР ТС 015/2011 справочно, в B не входит, с пометкой «документ на зерно»
test('бобовые: ТР ТС 015 справочно с пометкой «документ на зерно, не на пищевой продукт»', async () => {
  const { run } = await import('./fr81_helpers.js');
  const r = run('pulses', 'горох', [['Cs-137', 10]]);
  assert.equal(r.limits.ru[0].limitId, null);
  assert.match(r.limits.ru[0].reference.note, /документ на зерно/);
  assert.ok(r.warnings.some((w) => /ТР ТС 015.*документ на зерно, не на пищевой продукт/.test(w)), r.warnings.join('|'));
});

