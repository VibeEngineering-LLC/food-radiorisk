// #FR-85 v12: нейтральные уточнения, родовое слово + вид, субпродукты, русский стеммер отдельным файлом (по тесту на пункт)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { data } from './fr81_helpers.js';
import { matchProduct, productEntry, wordsOf } from '../src/calc/products.js';
import { normCodeFor } from '../src/calc/catalog.js';
import { dietDefaultFor, dietPick } from '../src/calc/diet.js';

const P = data.products;
const m = (n) => matchProduct(P, n);
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const lex = P.find((r) => r.kind === 'lexicon');
const diet = (n) => dietDefaultFor(data.diet, { productName: n, state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products: P });

test('п. 1: нейтральные уточнения не дают «частично» — сорт, жирность, обработка, число, возраст овоща', () => {
  const table = [
    ['сыр голландский','p_syr'],
    ['колбаса вареная докторская','p_varenaya_kolbasa'],
    ['сыр российский','p_rossiyskiy_syr'],
    ['сыр пошехонский','p_syr'],
    ['колбаса докторская','p_varenaya_kolbasa'],
    ['колбаса любительская','p_varenaya_kolbasa'],
    ['колбаса молочная','p_varenaya_kolbasa'],
    ['сосиски молочные','p_sosiski'],
    ['хлеб белый','p_khleb'],
    ['хлеб серый','p_khleb'],
    ['хлеб нарезной','p_khleb'],
    ['молоко пастеризованное','p_moloko'],
    ['молоко ультрапастеризованное','p_moloko'],
    ['молоко стерилизованное','p_moloko'],
    ['молоко топленое','p_moloko'],
    ['творог обезжиренный','p_tvorog'],
    ['творог нежирный','p_tvorog'],
    ['сметана жирная','p_smetana'],
    ['кефир 2,5%','p_kefir'],
    ['молоко 3,2 %','p_moloko'],
    ['сливки 10%','p_slivki'],
    ['картофель молодой','p_kartofel'],
    ['картошка молодая','p_kartofel'],
    ['капуста ранняя','p_kapusta'],
    ['капуста поздняя','p_kapusta'],
    ['морковь молодая','p_morkov'],
    // v13: классы уточнений — холод, жирность, возраст, происхождение, среда рыбы, сорт/разновидность
    ['говядина мороженая','p_govyadina'],
    ['говядина охлаждённая','p_govyadina'],
    ['свинина жирная','p_svinina'],
    ['свинина постная','p_svinina'],
    ['баранина молодая','p_baranina'],
    ['мясо свиное','p_svinina'],
    ['мясо говяжье','p_govyadina'],
    ['курица домашняя','p_kuritsa'],
    ['курица магазинная','p_kuritsa'],
    ['индейка охлаждённая','p_indeyka'],
    ['кролик домашний','p_krolik'],
    ['сало солёное','p_salo'],
    ['щука речная','p_shchuka'],
    ['карп зеркальный','p_karp'],
    ['горбуша мороженая','p_gorbusha'],
    ['сом речной','p_som'],
    ['форель магазинная','p_forel'],
    ['молоко домашнее','p_moloko'],
    ['молоко магазинное 3,2%','p_moloko'],
    ['кефир домашний','p_kefir'],
    ['йогурт натуральный','p_yogurt'],
    ['сыр твёрдый','p_syr'],
    ['масло подсолнечное рафинированное','p_maslo_podsolnechnoe'],
    ['масло сливочное солёное','p_maslo_slivochnoe'],
    ['масло сливочное несолёное','p_maslo_slivochnoe'],
    ['яйца домашние','p_kurinoe_yaytso'],
    ['картофель мытый','p_kartofel'],
    ['помидоры тепличные','p_tomat'],
    ['домашние огурцы','p_ogurets'],
    ['рис шлифованный','p_ris'],
    ['макароны высший сорт','p_makarony'],
    ['яблоко антоновка','p_yabloko'],
    ['груши садовые','p_grusha'],
    ['вишня домашняя','p_vishnya'],
    ['опята осенние','p_openok_osenniy'],
    ['вода питьевая бутилированная','p_voda_pitevaya'],
    ['питьевая вода бутилированная','p_voda_pitevaya'],
    ['вода бутилированная','p_voda_pitevaya'],
    ['пюре детское яблочное','p_detskoe_pitanie'],
    ['грибы лесные','p_griby']
  ];
  for (const [name, expectedId] of table) {
    const res = m(name);
    assert.equal(res.status, 'ok', `статус для «${name}» должен быть ok`);
    assert.equal(res.entry.id, expectedId, `id записи для «${name}» должен быть ${expectedId}`);
    assert.equal(res.uncovered.length, 0, `у «${name}» не должно быть непокрытых слов`);
    assert.ok(productEntry(P, name) !== null, `productEntry для «${name}» не должен быть null`);
  }
});

test('п. 1: «топлёное масло» — отдельный продукт, «молочная колбаса» — не молоко', () => {
  assert.equal(m('топленое масло').entry.id, 'p_maslo_toplenoe', '«топленое масло» должно быть p_maslo_toplenoe');
  assert.equal(m('масло топленое').entry.id, 'p_maslo_toplenoe', '«масло топленое» должно быть p_maslo_toplenoe');
  assert.equal(m('топленое масло').status, 'ok', 'статус «топленое масло» должен быть ok');
  assert.equal(m('масло топленое').status, 'ok', 'статус «масло топленое» должен быть ok');
  assert.notEqual(m('колбаса молочная').entry.id, 'p_moloko', '«колбаса молочная» не должна быть молоком');
  assert.equal(m('молочная колбаса').entry.id, 'p_varenaya_kolbasa', '«молочная колбаса» должна быть вареной колбасой');
});

// 14 названий проверки B (рыбная мука … свёкла кормовая) по-прежнему не принимаются молча — тот же список проверяет tests/fr85_v11.test.js, п. 2

test('п. 1: нейтральное слово действует только в своей области — не просачивается в другие продукты', () => {
  const names = ['молочная каша','белая рыба','молодая рыба','легкая сметана','сыр для крыс голландский','хлеб для крыс белый',
    // v13: слова новых классов не выходят за свою область
    // v15: «вода из крана» — не упакованная вода (D-026 п. 2), проверяется в tests/fr85_v15.test.js
    'вода морская','морская соль','щука морская','ежевика садовая','грибы домашние','вода домашняя','капуста соленая'];
  for (const name of names) {
    assert.notEqual(m(name).status, 'ok', `статус для «${name}» не должен быть ok`);
  }
  // v13: «морская» не ломает морскую капусту (своя запись), «рыба речная» — своя запись
  assert.equal(m('морская капуста').entry.id, 'p_kapusta_morskaya');
  assert.equal(m('рыба речная').entry.id, 'p_rechnaya_ryba');
});

test('п. 1: лексикон — нейтральные слова: закрытый список с обоснованием, нормализованные слова, область существует', () => {
  assert.ok(Array.isArray(lex.neutral), 'lex.neutral должен быть массивом');
  assert.ok(lex.neutral.length >= 6, 'lex.neutral должен содержать не менее 6 элементов');

  const modWords = new Set();
  const ids = new Set();
  const oneWord = new Set();

  for (const r of P) {
    if (r.kind === 'modifier') {
      for (const w of (r.words || [])) modWords.add(w);
    }
    if (r.kind === 'product') {
      ids.add(r.id);
      for (const s of (r.synonyms || [])) {
        const ws = wordsOf(s);
        if (ws.length === 1) oneWord.add(ws[0]);
      }
    }
    if (r.kind === 'choice') {
      for (const s of (r.synonyms || [])) {
        const ws = wordsOf(s);
        if (ws.length === 1) oneWord.add(ws[0]);
      }
    }
  }

  for (const g of lex.neutral) {
    assert.equal(typeof g.why, 'string', 'g.why должен быть строкой');
    assert.ok(g.why.length >= 40, 'g.why должен быть не короче 40 символов');
    assert.ok(Array.isArray(g.words) && g.words.length > 0, 'g.words должен быть непустым массивом');
    const hasEntries = Array.isArray(g.entries) && g.entries.length > 0;
    const hasDietGroups = Array.isArray(g.diet_groups) && g.diet_groups.length > 0;
    assert.ok(hasEntries || hasDietGroups, 'группа должна иметь entries или diet_groups');
    for (const id of (g.entries || [])) {
      assert.ok(ids.has(id), `id ${id} должен существовать среди продуктов`);
    }
    for (const w of g.words) {
      const ws = wordsOf(w);
      assert.equal(ws.length, 1, `слово «${w}» должно состоять из одного слова`);
      assert.equal(ws[0], w, `слово «${w}» должно быть нормализованным`);
      assert.ok(!modWords.has(w), `слово «${w}» не должно быть модификатором`);
      assert.ok(!oneWord.has(w), `слово «${w}» не должно быть однословным синонимом продукта`);
    }
  }
});

test('п. 2: родовое слово + вид — вид, а не «неоднозначно»', () => {
  const table = [
    ['рыба карась','p_karas'],
    ['рыба щука','p_shchuka'],
    ['рыба судак','p_sudak'],
    ['гриб белый','p_belyy_grib'],
    ['грибы шампиньоны','p_shampinon'],
    ['ягода черника лесная','p_chernika'],
    ['ягода клюква','p_klyukva'],
    ['ягоды клюквы','p_klyukva'],
    ['мясо свинина','p_svinina'],
    ['мясо говядина','p_govyadina'],
    // v13: овощ / фрукт / крупа + вид
    ['крупа рис','p_ris'],
    ['крупа пшено','p_psheno'],
    ['крупа гречка','p_grechnevaya_krupa'],
    ['овощ морковь','p_morkov'],
    ['овощ капуста','p_kapusta'],
    ['овощ свёкла','p_svekla'],
    ['фрукт яблоко','p_yabloko'],
    ['фрукт груша','p_grusha']
  ];
  for (const [name, expectedId] of table) {
    const res = m(name);
    assert.equal(res.status, 'ok', `статус для «${name}» должен быть ok`);
    assert.equal(res.entry.id, expectedId, `id записи для «${name}» должен быть ${expectedId}`);
    assert.equal(res.uncovered.length, 0, `у «${name}» не должно быть непокрытых слов`);
  }
});

test('п. 2: родовое слово не поглощает чужое — другая строка норматива, неизвестный вид, две разные записи', () => {
  assert.equal(m('рыба мамонта').status, 'partial', 'статус «рыба мамонта» должен быть partial');
  assert.equal(m('мясо мамонта').status, 'partial', 'статус «мясо мамонта» должен быть partial');
  assert.equal(m('рыба с картошкой').status, 'ambiguous', 'статус «рыба с картошкой» должен быть ambiguous');
  assert.equal(m('рыба курица').status, 'ambiguous', 'статус «рыба курица» должен быть ambiguous');
  assert.notEqual(m('ягода смородина').status, 'ok', 'статус «ягода смородина» не должен быть ok');
  // родовое слово не поглощается видом другой строки норматива: рыба + белый гриб, рыба + батон нарезной
  for (const n of ['рыба белый гриб', 'рыба батон нарезной']) assert.equal(m(n).status, 'partial', 'статус «' + n + '» должен быть partial');
});

test('п. 3: субпродукты — Прил. 4 п. 1, группа «мясо» с пометкой «оценка сверху»', () => {
  const names = ['печень','почки','сердце','язык','печень говяжья','печень свиная','печень куриная','почки говяжьи','почки свиные','сердце говяжье','сердце куриное','язык говяжий','язык свиной','легкие говяжьи','печень индейки','субпродукты'];
  for (const name of names) {
    const res = m(name);
    assert.equal(res.status, 'ok', `статус для «${name}» должен быть ok`);
    assert.equal(res.entry.id, 'p_subprodukty', `id записи для «${name}» должен быть p_subprodukty`);
    assert.equal(res.entry.norm.fresh, 't021_p4_r01_cs137', `norm.fresh для «${name}» должен быть t021_p4_r01_cs137`);
    assert.ok(normCodeFor(data.limits_ru, productEntry(P, name), 'fresh') !== null, `normCodeFor для «${name}» не должен быть null`);
    assert.equal(diet(name).group.code, 'meat', `группа для «${name}» должна быть meat`);
    assert.equal(dietPick(data.diet, name, P).base, false, `base для «${name}» должен быть false (оценка сверху, D-023 В1)`);
  }
  assert.equal(dietPick(data.diet, 'говядина', P).base, true, 'base для «говядина» должен быть true');
});

test('п. 3: печень трески — рыба; гусиная печень и печенье не затронуты; «легкие» без вида животного не субпродукт', () => {
  assert.equal(m('печень трески').entry.id, 'p_treska', '«печень трески» должна быть треской');
  assert.equal(m('печень трески').status, 'ok', 'статус «печень трески» должен быть ok');
  assert.equal(diet('печень трески').group.code, 'fish', 'группа «печень трески» должна быть fish');
  assert.equal(m('гусиная печень').entry.id, 'p_gusinaya_pechen', '«гусиная печень» должна быть p_gusinaya_pechen');
  assert.equal(m('печень гуся').entry.id, 'p_gusinaya_pechen', '«печень гуся» должна быть p_gusinaya_pechen');
  assert.equal(m('печенье овсяное').entry.id, 'p_ovsyanoe_pechene', '«печенье овсяное» должно быть p_ovsyanoe_pechene');
  assert.equal(m('печенье').entry, null, 'entry для «печенье» должен быть null');
  assert.notEqual(m('легкие').status, 'ok', 'статус «легкие» не должен быть ok');
  assert.equal(m('легкая сметана').entry.id, 'p_smetana', '«легкая сметана» должна быть сметаной');
  assert.equal(m('легкая сметана').status, 'partial', 'статус «легкая сметана» должен быть partial');
});

test('п. 4: русский стеммер — отдельный файл, без остальных языков и без пакета snowball-stemmers', () => {
  const src = read('../src/calc/snowball_ru.js');
  assert.ok(src.includes('ISC'), 'файл стеммера должен содержать лицензию ISC');
  assert.ok(src.includes('github.com/mazko/jssnowball'), 'файл стеммера должен содержать ссылку на jssnowball');
  assert.ok(src.includes('russianStemmer'), 'файл стеммера должен содержать russianStemmer');
  assert.ok(!src.includes('germanStemmer'), 'файл стеммера не должен содержать germanStemmer');
  assert.ok(!src.includes('frenchStemmer'), 'файл стеммера не должен содержать frenchStemmer');
  assert.ok(!src.includes('arabicStemmer'), 'файл стеммера не должен содержать arabicStemmer');
  assert.ok(statSync(new URL('../src/calc/snowball_ru.js', import.meta.url)).size < 100000, 'файл стеммера должен быть меньше 100KB');
  const prod = read('../src/calc/products.js');
  assert.ok(!prod.includes("from 'snowball-stemmers'"), 'products.js не должен импортировать snowball-stemmers');
  assert.ok(prod.includes("./snowball_ru.js"), 'products.js должен импортировать ./snowball_ru.js');
  const pkg = JSON.parse(read('../package.json'));
  assert.ok(!('snowball-stemmers' in (pkg.dependencies || {})), 'package.json не должен содержать snowball-stemmers в зависимостях');
});
