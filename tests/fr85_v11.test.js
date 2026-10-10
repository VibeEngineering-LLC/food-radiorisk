// #FR-85 v11: словоформы по основам Snowball, «частично», пробелы словаря, находки проверки A, интерфейс (по тесту на пункт)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, run, inputFor } from './fr81_helpers.js';
import { matchProduct, productEntry, productSuggestions, stemRu, wordsOf } from '../src/calc/products.js';
import { normCodeFor } from '../src/calc/catalog.js';
import { dietDefaultFor } from '../src/calc/diet.js';
import { listChoices, computeScenario } from '../src/calc/model.js';
import { productView, setField, initialRaw, toInput } from '../src/react/formState.js';
import { summaryParts } from '../src/ui/summary_text.js';
import { buildReport } from '../src/ui/report.js';

const P = data.products;
const m = (n) => matchProduct(P, n);
const byId = (id) => P.find((r) => r.id === id);
const code = (n, confirmId = null) => normCodeFor(data.limits_ru, productEntry(P, n, confirmId), 'fresh');
const diet = (n) => dietDefaultFor(data.diet, { productName: n, state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products: P });
const fixture = (f) => JSON.parse(readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8'));

test('п. 1: падежные формы распознаются по основам целых слов', () => {
  const pairs = [
    ['курицу', 'курица'],
    ['грибов', 'грибы'],
    ['молока', 'молоко'],
    ['говядину', 'говядина'],
    ['картошку', 'картошка'],
    ['сыра', 'сыр'],
    ['яиц', 'яйца'],
    ['подсолнечного масла', 'подсолнечное масло']
  ];
  for (const [form, base] of pairs) {
    assert.equal(m(form).status, 'ok', form);
    assert.equal(m(form).entry.id, m(base).entry.id, form);
  }
});

test('п. 1: различение сохраняется — сельдь/сельдерей, сыр/сыроежки, кабан/кабачок, лещ/лещина, сыр/сырьё, сыр/сырок', () => {
  const pairs = [
    ['сельди', 'сельдерея'],
    ['сыра', 'сыроежек'],
    ['кабана', 'кабачка'],
    ['леща', 'лещины'],
    ['сыра', 'сырья'],
    ['сыра', 'сырка']
  ];
  for (const [a, b] of pairs) {
    assert.equal(m(a).status, 'ok', a);
    assert.notEqual(m(b).entry?.id ?? null, m(a).entry.id, b);
  }
  assert.notEqual(m('сырьё').status, 'ok');
  assert.notEqual(m('сырок').entry?.id ?? null, 'p_syr');
});

test('п. 1: основы JS (snowball-stemmers) совпадают с основами Python (snowballstemmer) на всех словах словаря', () => {
  const py = fixture('fr85_stems_py.json').words;
  for (const [w, s] of Object.entries(py)) {
    assert.equal(stemRu(w), s, w);
  }
  const lex = P.find((r) => r.kind === 'lexicon');
  const skip = new Set([...lex.stopwords, ...Object.keys(lex.forms)]);
  for (const rec of P) {
    if (rec.kind === 'product' || rec.kind === 'choice') {
      for (const synonym of rec.synonyms) {
        for (const w of wordsOf(synonym)) {
          if (!skip.has(w)) {
            assert.ok(w in py, 'нет в выгрузке Python: ' + w);
          }
        }
      }
    } else if (rec.kind === 'modifier') {
      for (const w of rec.words) {
        if (!skip.has(w)) {
          assert.ok(w in py, 'нет в выгрузке Python: ' + w);
        }
      }
    }
  }
});

test('п. 2: 14 названий проверки B не принимаются молча — «частично»', () => {
  const names = [
    'рыбная мука',
    'костная мука',
    'травяная мука',
    'кокосовая мука',
    'растительный сыр',
    'сыр тофу',
    'соевый творог',
    'соевое мясо',
    'растительное мясо',
    'мясо мамонта',
    'молоко для кошек',
    'вода из реки',
    'вода для полива',
    'свёкла кормовая'
  ];
  for (const n of names) {
    const r = m(n);
    assert.ok(['partial', 'unknown'].includes(r.status), n); // v13: слова-замены и вода не того назначения — «не распознан» с пометкой composite
    assert.ok(r.uncovered.length > 0, n);
    assert.equal(productEntry(P, n), null, n);
    assert.equal(code(n), null, n);
    assert.equal(diet(n).group.code, 'other', n);
  }
});

test('п. 2: подтверждение — как ручной выбор, с отметкой в результате и отчёте', () => {
  const base = inputFor(null, 'мука кормовая', [['Cs-137', 10]]);
  const no = computeScenario(data, base);
  assert.ok(!no.warnings.some((w) => /подтверждению пользователя/.test(w)));
  const yes = computeScenario(data, { ...base, product: { name: 'мука кормовая', state: 'fresh', confirmId: 'p_muka' } });
  assert.ok(yes.ok);
  const w = yes.warnings.find((x) => /подтверждению пользователя/.test(x));
  assert.ok(w, yes.warnings.join(' | '));
  assert.match(w, /«Мука»/);
  assert.match(w, /«кормовая»/);
  assert.equal(code('мука кормовая', 'p_muka'), 'cereals');
  assert.equal(code('мука кормовая', 'p_moloko'), null);
  const md = buildReport('md', { input: { ...base, product: { name: 'мука кормовая', state: 'fresh', confirmId: 'p_muka' } }, result: yes }, { datasets: 1, records: 1, sha: '0' }, '2026-10-09T00:00:00.000Z').text;
  assert.match(md, /подтверждению пользователя/);
});

test('п. 2: форма — «частично»: текст, кнопка подтверждения, группы; подтверждение уходит в расчёт и сбрасывается сменой названия', () => {
  const ch = listChoices(data);
  const r0 = setField(initialRaw(ch), ch, 'product', 'мука кормовая');
  const v = productView(r0, ch);
  assert.equal(v.status, 'partial');
  assert.match(v.text, /по слову «мука»; слова «кормовая» не учтены/);
  assert.equal(v.confirm.id, 'p_muka');
  assert.ok(v.groups.length > 5);
  assert.equal(toInput(r0, ch).product.confirmId, undefined);
  const r1 = setField(r0, ch, 'productConfirm', 'p_muka');
  assert.equal(productView(r1, ch).status, 'confirmed');
  assert.equal(toInput(r1, ch).product.confirmId, 'p_muka');
  assert.equal(r1.foodGroup, 'cereals');
  const r2 = setField(r1, ch, 'product', 'мука кормовая костная');
  assert.equal(r2.productConfirm, '');
});

test('п. 3: частые названия распознаются с группами D-024', () => {
  const cases = [
    ['помидор', 'vegetables', 'vegetables'],
    ['телятина', 'meat', 'meat'],
    ['заяц', 'meat_game', 'game'],
    ['овсянка', 'cereals', 'cereals'],
    ['креветка', 'fish', 'fish'],
    ['морковка', 'vegetables', 'vegetables'],
    ['детская смесь', 'baby_food', 'baby'],
    ['птица', 'meat', 'meat'],
    ['яйцо', null, 'eggs'],
    ['фрукты', null, 'fruit'],
    ['краб', 'fish', 'fish'],
    ['тунец', 'fish', 'fish'],
    ['чай', null, 'herbal']
  ];
  for (const [n, normCode, dietGroup] of cases) {
    assert.equal(m(n).status, 'ok', n);
    assert.equal(code(n), normCode, n);
    assert.equal(m(n).entry.diet.group, dietGroup, n);
  }
});

test('п. 3: клубника, малина, смородина, черника, земляника без уточнения — выбор «садовая» / «дикорастущая (лесная)»', () => {
  const names = ['клубника', 'малина', 'смородина']; // v13: черника и земляника без уточнения — дикорастущие (С8)
  for (const n of names) {
    const r = m(n);
    assert.equal(r.status, 'ambiguous', n);
    assert.equal(r.candidates.length, 2, n);
    const garden = r.candidates.find((e) => e.norm.fresh === null);
    const wild = r.candidates.find((e) => e.norm.fresh === 't021_p4_r16_cs137');
    assert.ok(garden && wild, n);
    assert.equal(garden.diet.group, 'fruit', n);
    assert.equal(wild.diet.group, 'berries_wild', n);
    assert.equal(m(garden.name_ru).entry.id, garden.id, n);
    assert.equal(m(wild.name_ru).entry.id, wild.id, n);
  }
});

test('п. 4: нормативы — кукуруза и масличные по ТР ТС 015 справочно, сыр типа коттедж — творог', () => {
  assert.equal(byId('p_kukuruza').norm.fresh, 't015_grain_cereals_cs137');
  const oilseeds = ['p_soya', 'p_arakhis', 'p_kunzhut', 'p_podsolnechnika_semechki'];
  for (const id of oilseeds) {
    assert.equal(byId(id).norm.fresh, 't015_grain_oilseeds_cs137', id);
    assert.match(byId(id).note, /документ на зерно/, id);
  }
  assert.equal(m('сыр типа коттедж').entry.id, 'p_tvorog');
  assert.equal(P.filter((r) => r.kind === 'product' && r.synonyms.includes('клубника')).length, 0);
  const r = run('cereals', 'кукуруза', [['Cs-137', 10]]);
  assert.equal(r.limits.ru[0].limitId, null);
  assert.equal(r.limits.ru[0].reference.H, 60);
  assert.match(r.limits.ru[0].reference.note, /документ на зерно/);
  assert.equal(r.limits.compliance, null);
});

test('п. 4: ключи КП, сухое вещество, обработка сала', () => {
  const transferCases = [
    ['p_volnushka_rozovaya', 'Рыжик, груздь, волнушка (Lactarius)'],
    ['p_belyy_gruzd', 'Рыжик, груздь, волнушка (Lactarius)'],
    ['p_gruzd_chernyy', 'Рыжик, груздь, волнушка (Lactarius)'],
    ['p_dozhdevik_zhemchuzhnyy', 'слабонакапливающие грибы: опенок осенний, гриб зонтичный, дождевик'],
    ['p_zontik_pestryy', 'слабонакапливающие грибы: опенок осенний, гриб зонтичный, дождевик'],
    ['p_bolotnyy_podberezovik', 'средненакапливающие: лисичка, подберезовик, белый, подосиновик, рядовка серая'],
    ['p_solenye_syroezhki', 'Сыроежка (Russula)'],
    ['p_lekarstvennoe_rastitelnoe_syre', '10 видов лекарственного растительного сырья, Воронежская обл. (не ягоды)']
  ];
  for (const [id, item] of transferCases) {
    assert.ok(byId(id).transfer.includes(item), id);
  }
  const dryMatterCases = [
    ['p_gorokh_posevnoy', 'trs472_dry_matter_n_a_garden_pea_seeds'],
    ['p_lesnaya_malina', 'trs472_dry_matter_n_a_wild_raspberry_rubus_idaeus'],
    ['p_soya', 'trs472_dry_matter_n_a_soya_seeds']
  ];
  for (const [id, dm] of dryMatterCases) {
    assert.equal(byId(id).dry_matter, dm, id);
  }
  const fatIds = ['p_salo', 'p_shpik'];
  for (const id of fatIds) {
    assert.ok(byId(id).processing.includes('fat'), id);
  }
});

test('п. 4: классы EU — малозначимые (Annex II) и жидкие продукты', () => {
  const minorIds = [
    'p_chesnok',
    'p_manioka',
    'p_perets_chernyy',
    'p_dushistyy_perets',
    'p_krasnyy_molotyy_perets',
    'p_koritsa',
    'p_kurkuma',
    'p_boby_kakao',
    'p_zernistaya_ikra',
    'p_ikra_krasnaya'
  ];
  for (const id of minorIds) {
    assert.equal(byId(id).codex[0], 'minor', id);
  }
  const liquidIds = [
    'p_kvas_khlebnyy',
    'p_limonad',
    'p_vodka',
    'p_mors_yagodnyy',
    'p_berezovyy_sok',
    'p_voda_kokosovaya',
    'p_moloko_soevoe',
    'p_moloko_ovsyanoe'
  ];
  for (const id of liquidIds) {
    assert.equal(byId(id).codex[0], 'liquid', id);
  }
  const r = run(null, 'корица', [['Cs-137', 10]]);
  const ids = r.limits.foreign.map((f) => f.id);
  assert.ok(ids.includes('eu_2016_52_a2_cs_minor'), ids.join(','));
  assert.ok(!ids.some((x) => /^eu_2016_52_a1_/.test(x)), ids.join(','));
});

test('п. 4: дубли синонимов слиты в одну запись или разведены выбором', () => {
  const pairs = [
    ['болгарский перец', 'перец сладкий'],
    ['рыба своего вылова', 'рыба своего улова'],
    ['рыба собственного улова', 'рыба своего улова'],
    ['греческий орех', 'грецкий орех'],
    ['кофе в зернах', 'кофе'],
    ['кофейные бобы', 'кофе'],
    ['орех лещина', 'лещина'],
    ['перец черный молотый', 'перец черный'],
    ['перец душистый горошком', 'душистый перец'],
    ['гриб зонтик пестрый', 'зонтик пестрый'],
    ['боровик', 'белый гриб'],
    ['мясо кальмара', 'кальмар'],
    ['мясо креветки', 'креветки'],
    ['мясо мидии', 'мидии'],
    ['семечки тыквенные', 'семена тыквы'],
    ['лекарственные растения', 'лекарственное растительное сырье'],
    ['сырье лекарственное', 'лекарственное растительное сырье'],
    ['сбор лекарственных трав', 'лекарственное растительное сырье'],
    ['водоросли съедобные', 'водоросли'],
    ['ламинария', 'морская капуста'],
    ['рахат лукум', 'лукум'],
    ['свекла столовая', 'свекла'],
    ['корень сельдерея', 'сельдерей корневой'],
    ['сыр типа коттедж из обезжиренного молока', 'творог']
  ];
  for (const [a, b] of pairs) {
    assert.equal(m(a).status, 'ok', a);
    assert.equal(m(a).entry.id, m(b).entry.id, a);
  }
  const ambiguous = ['красный перец', 'окунь', 'перец горошком', 'перец молотый', 'брюква репа'];
  for (const n of ambiguous) {
    assert.equal(m(n).status, 'ambiguous', n);
  }
});

test('п. 5: интерфейс — без служебного кода, «норматив РФ не установлен» в результате, рыбий жир без рациона, без литературных подписей в подсказках', () => {
  const g = run('pulses', 'горох', [['Cs-137', 10]]);
  assert.ok(!JSON.stringify(g.limits).includes('D-024'));
  assert.ok(!g.warnings.some((w) => w.includes('D-024')));
  const a = run(null, 'яблоко', [['Cs-137', 10]]);
  assert.equal(a.limits.ruNone, true);
  const s = summaryParts(a, inputFor(null, 'яблоко', [['Cs-137', 10]]));
  assert.ok(s.verdict.lines.some((l) => /Норматив РФ для продукта «Яблоко» не установлен/.test(l.text)), JSON.stringify(s.verdict.lines));
  const fo = diet('рыбий жир');
  assert.equal(fo.status, 'not_established');
  assert.equal(fo.group, null);
  const sug = productSuggestions(P);
  const forbidden = [
    'Мясо 7 месячного бычка',
    'Мясо всех видов животных',
    'Мясо взрослых животных',
    'Мышечная ткань рыбы',
    '10 видов лекарственного растительного сырья',
    'Сливки 20 %'
  ];
  for (const label of forbidden) {
    assert.ok(!sug.includes(label), label);
  }
  assert.ok(sug.includes('Говядина'));
  assert.equal(m('мясо 7 месячного бычка').entry.id, 'p_govyadina');
});
