import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { matchProduct, stemRu } from '../src/calc/products.js';
// computeScenario — из model.js (правка руками: сгенерированный импорт listChoices был из formState.js)
import { computeScenario } from '../src/calc/model.js';
import { transferOptions } from '../src/ui/product.js';
import { productView } from '../src/react/formState.js';
import { listChoices } from '../src/calc/model.js';
const P = data.products;
const m = (n) => matchProduct(P, n);
const byId = (id) => P.find((r) => r.id === id);
const lex = P.find((r) => r.kind === 'lexicon');

test('п. 1: решения оператора D-024 Сверка 2 — горошек зелёный, черника/земляника, «ягоды» — вопрос, «дикорастущие ягоды» — ok', () => {
  // Горошек
  const r1 = m('горошек зеленый');
  assert.equal(r1.status, 'ok');
  assert.equal(r1.entry.id, 'p_goroshek_zelenyy');
  assert.equal(r1.entry.norm.fresh, 't021_p4_r13_cs137');
  assert.equal(r1.entry.diet.group, 'vegetables');
  assert.equal(byId('p_gorokh').norm.fresh, 't015_grain_pulses_cs137');

  // Ягоды: черника, земляника
  const r2 = m('черника');
  assert.equal(r2.status, 'ok');
  assert.equal(r2.entry.id, 'p_chernika');
  assert.equal(r2.entry.norm.fresh, 't021_p4_r16_cs137');

  const r3 = m('земляника');
  assert.equal(r3.status, 'ok');
  assert.equal(r3.entry.id, 'p_zemlyanika_lesnaya');
  assert.equal(r3.entry.norm.fresh, 't021_p4_r16_cs137');

  // Ягоды — неоднозначно
  for (const name of ['ягоды', 'ягода']) {
    const r = m(name);
    assert.equal(r.status, 'ambiguous');
    const ids = r.candidates.map(c => c.id).sort();
    assert.deepEqual(ids, ['p_yagody', 'p_yagody_sadovye']);
  }

  // Дикорастущие — ок
  for (const name of ['дикорастущие ягоды', 'ягоды дикорастущие', 'дикие ягоды', 'лесные ягоды']) {
    const r = m(name);
    assert.equal(r.status, 'ok');
    assert.equal(r.entry.norm.fresh, 't021_p4_r16_cs137');
  }

  // «ягода черника лесная», «ягоды клюквы» (родовое слово + вид при выборе) — tests/fr85_v12.test.js, п. 2
});

test('п. 2: ключи КП — только записи самого продукта; родовое «мясо» и «молоко сухое» без ключей, «Сводная оценка» по умолчанию не предлагается', () => {
  const choices = { transfer: data.transfer, products: P };

  // Мясные и молочные без ключей
  for (const name of ['мясо', 'молоко сухое']) {
    const o = transferOptions(choices, 'Cs-137', name);
    assert.equal(o.fallback, true);
    assert.equal(o.reason, 'no_keys');
  }

  // Молоко — есть ключи
  const oMoloko = transferOptions(choices, 'Cs-137', 'молоко');
  assert.equal(oMoloko.fallback, false);
  assert.ok(oMoloko.matched > 0);

  // Пустые массивы transfer
  assert.deepEqual(byId('p_myaso').transfer, []);
  assert.deepEqual(byId('p_moloko_2').transfer, []);

  // Проверка transfer ягод
  const yagodyTransfer = byId('p_yagody').transfer;
  for (const item of yagodyTransfer) {
    const lower = item.toLowerCase();
    assert.ok(!lower.startsWith('земляника,'));
    assert.ok(!lower.startsWith('черника,'));
  }

  // Сканирование всех продуктов с непустым transfer
  const allowedHeads = [
    'Рыжик, груздь, волнушка (Lactarius)',
    'Розитес (колпак кольчатый, Rozites caperatus)',
    'Подберёзовик, подосиновик (Leccinum)',
    'Моховик, польский гриб (Xerocomus)'
  ];

  const fails = [];
  for (const prod of P) {
    if (!prod.transfer || prod.transfer.length === 0) continue;

    // Собираем стемы имени продукта и синонимов
    const prodWords = [];
    const addWords = (text) => {
      if (!text) return;
      const normalized = text.toLowerCase().replace(/ё/g, 'е');
      const words = normalized.split(/[^a-zа-яё]+/).filter(w => w.length >= 3);
      for (const w of words) {
        prodWords.push(stemRu(w));
      }
    };
    addWords(prod.name_ru);
    if (prod.synonyms) {
      for (const syn of prod.synonyms) addWords(syn);
    }
    const prodStems = new Set(prodWords);

    for (const item of prod.transfer) {
      const lower = item.toLowerCase();
      // Пропуск специфических записей
      if (lower.includes('накапливающ') || lower.includes('аккумулятор') || lower.includes('коэффициент перехода cs-137')) {
        continue;
      }

      // Извлечение head
      let head = item;
      const commaIdx = head.indexOf(',');
      const parenIdx = head.indexOf('(');
      let cutIdx = -1;
      if (commaIdx !== -1 && parenIdx !== -1) cutIdx = Math.min(commaIdx, parenIdx);
      else if (commaIdx !== -1) cutIdx = commaIdx;
      else if (parenIdx !== -1) cutIdx = parenIdx;

      if (cutIdx !== -1) head = head.substring(0, cutIdx);
      head = head.trim();

      // Пропуск разрешенных родовых записей
      if (allowedHeads.some(a => item.toLowerCase().startsWith(a.toLowerCase()))) { // правка руками: сравнение с записью целиком, не с головой
        continue;
      }

      // Собираем стемы head
      const headWords = [];
      const normalizedHead = head.toLowerCase().replace(/ё/g, 'е');
      const hWords = normalizedHead.split(/[^a-zа-яё]+/).filter(w => w.length >= 3);
      for (const w of hWords) {
        headWords.push(stemRu(w));
      }
      const headStems = new Set(headWords);

      // Проверка пересечения
      let intersect = false;
      for (const s of headStems) {
        if (prodStems.has(s)) {
          intersect = true;
          break;
        }
      }

      if (!intersect) {
        fails.push(`${prod.id}: ${item}`);
      }
    }
  }

  assert.deepEqual(fails, []);
});

test('п. 4: блюдо или слово, меняющее продукт, — «не распознан» с пояснением, без кнопки «Да, это X»', () => {
  const cases = [
    ['рисовая каша на молоке', 'dish'],
    ['салат оливье', 'dish'],
    ['вода морская', 'changes'],
    ['вода дождевая', 'changes'],
    ['вода для полива', 'changes'],
    ['вода в бассейне', 'changes'],
    ['вода из Финского залива', 'changes'],
    ['рыбная мука', 'changes'],
    ['соевое мясо', 'changes'],
    ['соевый творог тофу', 'changes'],
    ['птичье молоко', 'changes'],
    ['трава на лугу', 'changes'],
    ['курица дикая', 'changes'] // v14: «утка дикая» теперь дичь п. 2 (D-024 С5, D-025) — блокирующее «дикий» остаётся только у домашней птицы
  ];

  for (const [name, kind] of cases) {
    const r = m(name);
    assert.equal(r.status, 'unknown', `Expected unknown for "${name}"`);
    assert.equal(r.entry, null, `Entry should be null for "${name}"`);
    assert.ok(r.composite, `Composite should exist for "${name}"`);
    assert.equal(r.composite.kind, kind, `Composite kind should be ${kind} for "${name}"`);
  }

  const choices = listChoices(data);

  // Проверка productView для блюда
  const v1 = productView({ product: 'рисовая каша на молоке', dietGroup: '' }, choices);
  assert.equal(v1.status, 'unknown');
  assert.equal(v1.confirm, null);
  assert.ok(v1.groups.length > 5);
  assert.ok(/готового блюда/.test(v1.text));

  // Проверка productView для меняющего продукта
  const v2 = productView({ product: 'вода морская', dietGroup: '' }, choices);
  assert.equal(v2.status, 'unknown');
  assert.equal(v2.confirm, null);
  assert.ok(/меняет продукт/.test(v2.text));

  const r4 = m('вода из реки'); // v15: «вода из крана» — не упакованная вода (D-026 п. 2); речная вода — по-прежнему не принимается молча
  assert.equal(r4.status, 'unknown');

  // область блокирующего слова: «дождевой» меняет только воду, у картофеля — обычное «частично»
  assert.equal(m('картофель дождевой').status, 'partial');
});

test('п. 5: пробелы словаря — куриное филе, куры, гуси, караси, батон, волнушки, сморчки, спагетти, мандарины, брокколи и формы с беглой гласной', () => {
  const table = [
    ['куриное филе', 'p_kuritsa'],
    ['куры', 'p_kuritsa'],
    ['гуси', 'p_gus'],
    ['гусей', 'p_gus'],
    ['караси', 'p_karas'],
    ['карасей', 'p_karas'],
    ['батон', 'p_khleb'],
    ['волнушки', 'p_volnushka_rozovaya'],
    ['волнушек', 'p_volnushka_rozovaya'],
    ['сморчки', 'p_smorchok'],
    ['сморчков', 'p_smorchok'],
    ['спагетти', 'p_makarony'],
    ['мандарины', 'p_mandarin'],
    ['брокколи', 'p_brokkoli'],
    ['сыроежек', 'p_syroezhka'],
    ['вишен', 'p_vishnya'],
    ['маслят', 'p_maslenok'],
    ['хек', 'p_hek'],
    ['сайра', 'p_sayra'],
    ['конина', 'p_konina'],
    ['зелень', 'p_zelen'],
    ['масло льняное', 'p_maslo_lnyanoe'],
    ['печёнка', 'p_subprodukty'],
    ['шпроты', 'p_konservy_rybnye'],
    ['манка', 'p_krupa_mannaya'],
    ['перловка', 'p_yachmen'],
    ['дичь', 'p_dich'],
    ['свиной окорок', 'p_svinina'],
    ['шоколад', 'p_molochnyy_shokolad']
  ];

  for (const [name, expectedId] of table) {
    const r = m(name);
    assert.equal(r.status, 'ok', `Expected ok for "${name}"`);
    assert.equal(r.entry.id, expectedId, `Expected id ${expectedId} for "${name}"`);
  }

  // Облепиха — неоднозначно
  const rOb = m('облепиха');
  assert.equal(rOb.status, 'ambiguous');
  const idsOb = rOb.candidates.map(c => c.id).sort();
  assert.deepEqual(idsOb, ['p_yagody', 'p_yagody_sadovye']);

  // Олень — неоднозначно
  const rOl = m('олень');
  assert.equal(rOl.status, 'ambiguous');
  const idsOl = rOl.candidates.map(c => c.id).sort();
  assert.deepEqual(idsOl, ['p_blagorodnyy_olen', 'p_olen_severnyy']);

  // Сыр — не гриб
  assert.equal(m('сыр').entry.id, 'p_syr');
});

test('п. 6: название и вид пробы противоречат — предупреждение в результате', () => {
  const warn = (name, state) => computeScenario(data, inputFor(null, name, [['Cs-137', 10]], { product: { name, state } })).warnings;

  // Противоречие: сушёные vs fresh
  const w1 = warn('сушёные грибы', 'fresh');
  assert.ok(w1.some(w => /указан вид «сушёный», а выбран вид «сырой или свежий»/.test(w)));

  // то же, когда слово состояния стоит среди нескольких слов (сопоставление по подмножеству слов: «белый гриб» + повтор «грибы»)
  assert.ok(warn('сушёные грибы белый гриб', 'fresh').some(w => /указан вид «сушёный», а выбран вид «сырой или свежий»/.test(w)));

  // Противоречие: свежие vs dried
  const w2 = warn('свежие грибы', 'dried');
  assert.ok(w2.some(w => /указан вид «сырой или свежий», а выбран вид «сушёный»/.test(w)));

  // Согласие: сушёные vs dried
  const w3 = warn('грибы сушёные', 'dried');
  assert.ok(!w3.some(w => /указан вид/.test(w)));

  // Согласие: свежие vs fresh
  const w4 = warn('свежие грибы', 'fresh');
  assert.ok(!w4.some(w => /указан вид/.test(w)));

  // Слово "сухое" в названии продукта не должно вызывать предупреждение
  const w5 = warn('молоко сухое', 'fresh');
  assert.ok(!w5.some(w => /указан вид/.test(w)));
});

test('п. 3–4: лексикон — группы нейтральных слов и блокирующих слов: обоснование, область, нормализованные слова', () => {
  // Нейтральные группы
  assert.ok(lex.neutral.length >= 22);

  for (const group of lex.neutral) {
    assert.ok(typeof group.why === 'string' && group.why.length >= 40, 'why must be string >= 40');
    assert.ok(Array.isArray(group.words) && group.words.length > 0, 'words must be non-empty array');

    for (const word of group.words) {
      assert.equal(word, word.toLowerCase(), 'word must be lowercase');
      assert.ok(!word.includes('ё'), 'word must not contain ё');
      assert.ok(!word.includes(' '), 'word must not contain space');
    }

    // Для групп с индексом >= 6 проверяем наличие entries или diet_groups
    const idx = lex.neutral.indexOf(group);
    if (idx >= 6) {
      const hasEntries = Array.isArray(group.entries) && group.entries.length > 0;
      const hasDietGroups = Array.isArray(group.diet_groups) && group.diet_groups.length > 0;
      assert.ok(hasEntries || hasDietGroups, 'Group at index >= 6 must have entries or diet_groups');
    }
  }

  // Блокирующие слова
  assert.ok(Array.isArray(lex.blockers) && lex.blockers.length >= 5);

  let hasDishKasha = false;
  let hasChangesVoda = false;

  for (const blocker of lex.blockers) {
    assert.ok(['dish', 'changes'].includes(blocker.kind), 'kind must be dish or changes');
    assert.ok(typeof blocker.why === 'string' && blocker.why.length >= 40, 'why must be string >= 40');
    assert.ok(Array.isArray(blocker.words) && blocker.words.length > 0, 'words must be non-empty array');

    for (const word of blocker.words) {
      assert.equal(word, word.toLowerCase(), 'word must be lowercase');
      assert.ok(!word.includes(' '), 'word must not contain space');
    }

    // Проверка наличия конкретных блокировщиков
    if (blocker.kind === 'dish' && blocker.words.includes('каша')) {
      hasDishKasha = true;
    }

    if (blocker.kind === 'changes' && Array.isArray(blocker.entries) && blocker.entries.includes('p_voda_pitevaya') && blocker.words.includes('морская')) {
      hasChangesVoda = true;
    }
  }

  assert.ok(hasDishKasha, 'Must have dish blocker with word "каша"');
  assert.ok(hasChangesVoda, 'Must have changes blocker with entries p_voda_pitevaya and word "морская"');

  // Проверка существования всех упомянутых id
  const checkIds = (list) => {
    for (const item of list) {
      if (Array.isArray(item.entries)) {
        for (const id of item.entries) {
          assert.ok(byId(id), `Id ${id} must exist`);
        }
      }
    }
  };

  checkIds(lex.neutral);
  checkIds(lex.blockers);
});
