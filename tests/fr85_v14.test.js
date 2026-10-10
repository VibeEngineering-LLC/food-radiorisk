import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { matchProduct, normalizeName } from '../src/calc/products.js';
import { dietDefaultFor, dietScopeText } from '../src/calc/diet.js';
import { computeScenario, listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { restore, serialize } from '../src/react/persist.js';
import { renderJsx } from './render_helper.js';
import { T } from '../src/ui/texts_v.js';
import { fmtNum } from '../src/ui/fmt.js';

const P = data.products;
const m = (n, confirm) => matchProduct(P, n, confirm);
const byId = (id) => P.find((r) => r.id === id);
const lex = P.find((r) => r.kind === 'lexicon');
const pick = (name, mode = 'default') => dietDefaultFor(data.diet, { productName: name, state: 'fresh', age: 'adult', lifetime: null, mode, products: P });
const ch = listChoices(data);
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');

// п. 1: формы «лось» не «лосось»; класс столкновений закрыт
test('п. 1: формы «лось» не «лосось»; класс столкновений закрыт', () => {
  const losForms = ['лось', 'лося', 'лосю', 'лосем', 'лосе', 'лоси', 'лосей', 'лосям', 'лосями', 'лосях'];
  for (const f of losForms) {
    const r = m(f);
    assert.equal(r.status, 'ok', f);
    assert.equal(r.entry.id, 'p_los', f);
    assert.equal(r.entry.norm.fresh, 't021_p4_r02_cs137', f);
    assert.equal(pick(f).group.code, 'game', f);
  }

  const lososForms = ['лосось', 'лосося', 'лососю', 'лососем', 'лососе', 'лососи', 'лососей', 'лососям', 'лососями', 'лососях'];
  for (const f of lososForms) {
    const r = m(f);
    assert.equal(r.status, 'ok', f);
    assert.equal(r.entry.id, 'p_losos', f);
  }

  const E = {
    soft: ['и', 'ью', 'я', 'ю', 'ем', 'е', 'ей', 'ям', 'ями', 'ях'],
    a: ['ы', 'и', 'е', 'у', 'ой', 'ою', 'ам', 'ами', 'ах', ''],
    ya: ['и', 'е', 'ю', 'ей', 'ею', 'ям', 'ями', 'ях', 'ь', ''],
    o: ['а', 'у', 'ом', 'е', 'ам', 'ами', 'ах', ''],
    e: ['я', 'ю', 'ем', 'ям', 'ями', 'ях', 'й', ''],
    cons: ['а', 'у', 'ом', 'е', 'ы', 'и', 'ов', 'ам', 'ами', 'ах', 'ей', 'ем'],
    fleet: ['а', 'у', 'ом', 'е', 'и', 'ов', 'ам', 'ами', 'ах', 'ы']
  };

  const formsOf = (w) => {
    const s = new Set();
    if (/(ый|ой|ий)$/.test(w)) return s;
    const last = w.slice(-1);
    if (last === 'ь') {
      for (const e of E.soft) s.add(w.slice(0, -1) + e);
    } else if (last === 'а') {
      for (const e of E.a) s.add(w.slice(0, -1) + e);
    } else if (last === 'я') {
      for (const e of E.ya) s.add(w.slice(0, -1) + e);
    } else if (last === 'о') {
      for (const e of E.o) s.add(w.slice(0, -1) + e);
    } else if (last === 'е') {
      for (const e of E.e) s.add(w.slice(0, -1) + e);
    } else if (!['й', 'ы', 'и', 'у', 'ю', 'э'].includes(last)) {
      for (const e of E.cons) s.add(w + e);
      const last2 = w.slice(-2);
      if (last2 === 'ок' || last2 === 'ек' || last2 === 'ец') {
        for (const e of E.fleet) s.add(w.slice(0, -2) + w.slice(-1) + e);
      }
    }
    s.delete(w);
    return s;
  };

  const known = new Set();
  const addWords = (str) => {
    if (!str) return;
    const norm = normalizeName(str);
    norm.split(' ').forEach((w) => known.add(w));
  };

  for (const p of P) {
    if (p.kind === 'product') {
      addWords(p.name_ru);
      if (p.synonyms) p.synonyms.forEach(addWords);
    }
  }
  // choices
  if (ch && ch.choices) {
    for (const c of ch.choices) {
      addWords(c.name);
      if (c.synonyms) c.synonyms.forEach(addWords);
    }
  }

  const KNOWN_UNREAL = [];
  const bad = [];

  for (const product of P) {
    if (product.kind !== 'product') continue;
    if (!product.synonyms) continue;
    for (const syn of product.synonyms) {
      if (syn.includes(' ')) continue;
      const norm = normalizeName(syn);
      if (!/^[а-я]{3,}$/.test(norm)) continue;
      const forms = formsOf(norm);
      for (const form of forms) {
        if (known.has(form)) continue;
        const r = m(form);
        if (r.status === 'ok' && r.entry.id !== product.id) {
          const pairA = (r.entry.norm.fresh ?? '') + '|' + (r.entry.diet.group ?? '');
          const pairB = (product.norm.fresh ?? '') + '|' + (product.diet.group ?? '');
          if (pairA !== pairB) {
            bad.push(`${form} (от «${syn}», ${product.name_ru}) -> ${r.entry.name_ru}`);
          }
        }
      }
    }
  }

  const rest = bad.filter((l) => !KNOWN_UNREAL.includes(l));
  assert.deepEqual(rest, [], 'неожиданные столкновения: ' + rest.join('; '));
});

// п. 2: «лосиное мясо»
test('п. 2: «лосиное мясо»', () => {
  const names = ['лосиное мясо', 'мясо лосиное', 'лосиного мяса', 'лосятина', 'мясо лося'];
  for (const n of names) {
    const r = m(n);
    assert.equal(r.status, 'ok', n);
    assert.equal(r.entry.id, 'p_los', n);
    assert.equal(r.entry.norm.fresh, 't021_p4_r02_cs137', n);
    assert.equal(pick(n).group.code, 'game', n);
  }

  // D-025 п. 1: не трогать
  // «дикий чеснок» — с v15 (D-026 п. 4) черемша, проверяется в tests/fr85_v15.test.js
  assert.equal(m('фасоль стручковая').status, 'partial', 'фасоль стручковая');
  assert.equal(m('фасоль стручковая').entry.id, 'p_fasol', 'фасоль стручковая');
});

// п. 3: дикая утка, гусь, птица → game
test('п. 3: дикая утка, гусь, птица → game', () => {
  const names = ['дикая утка', 'утка дикая', 'дикий гусь', 'гусь дикий', 'дикая птица', 'дикие утки', 'диких уток', 'дикие гуси'];
  for (const n of names) {
    const r = m(n);
    assert.equal(r.status, 'ok', n);
    assert.equal(r.entry.norm.fresh, 't021_p4_r02_cs137', n);
    assert.equal(r.entry.diet.group, 'game', n);
    assert.equal(pick(n).group.code, 'game', n);
  }

  // v13: блокирующее слово не сломано
  const blocked = ['курица дикая', 'дикая курица', 'дикая индейка', 'дикий кролик'];
  for (const n of blocked) {
    const r = m(n);
    assert.equal(r.status, 'unknown', n);
    assert.ok(r.composite, n);
    assert.equal(r.composite.kind, 'changes', n);
  }
});

// п. 4: «сырки» → п. 5
test('п. 4: «сырки» → п. 5', () => {
  const names = ['сырки творожные', 'сырки', 'сырок', 'сырок творожный', 'творожный сырок', 'сырка творожного'];
  for (const n of names) {
    const r = m(n);
    assert.equal(r.status, 'ok', n);
    assert.equal(r.entry.id, 'p_syrok_tvorozhnyy', n);
    assert.equal(r.entry.norm.fresh, 't021_p4_r05_cs137', n);
  }

  const glaz = ['сырки глазированные', 'сырок глазированный'];
  for (const n of glaz) {
    const r = m(n);
    assert.equal(r.status, 'ok', n);
    assert.equal(r.entry.id, 'p_glazirovannye_syrki', n);
  }
});

// п. 5: «оценка сверху» для масел
test('п. 5: «оценка сверху» для масел', () => {
  const oils = P.filter((r) => r.kind === 'product' && r.diet.group === 'oil');
  assert.ok(oils.length >= 12, 'oils.length');

  for (const p of oils) {
    if (p.id === 'p_maslo_rastitelnoe') continue;
    assert.equal(p.diet.base, false, p.id);
  }
  assert.equal(byId('p_maslo_rastitelnoe').diet.base, true, 'p_maslo_rastitelnoe');

  const SCOPE = T.DIET_SCOPE.split('{')[0];
  const names = ['масло оливковое', 'масло льняное', 'масло кукурузное', 'масло подсолнечное', 'масло рапсовое', 'масло соевое', 'масло кунжутное', 'масло пальмовое', 'арахисовое масло', 'кокосовое масло', 'масло какао'];
  let count = 0;
  for (const n of names) {
    if (m(n).status !== 'ok') continue;
    count++;
    assert.ok(dietScopeText(pick(n).group).startsWith(SCOPE), n);
    assert.equal(pick(n).group.direction, 'upper', n);
  }
  assert.ok(count >= 9, 'count: ' + count);

  assert.equal(dietScopeText(pick('масло растительное').group), '', 'масло растительное');
});

// п. 6: блюда не распознаются
test('п. 6: блюда не распознаются', () => {
  const dishes = ['суп грибной', 'грибной суп', 'рисовая каша на молоке', 'каша молочная рисовая', 'гусарский салат', 'карпаччо из говядины', 'торт морковный', 'кисель густой'];
  for (const n of dishes) {
    const r = m(n);
    assert.equal(r.status, 'unknown', n);
    assert.equal(r.entry, null, n);
    assert.equal(pick(n).group.code, 'other', n);
    assert.equal(pick(n).rec, null, n);
  }

  const pv = S.productView({ product: 'суп грибной', dietGroup: '' }, ch);
  assert.equal(pv.confirm, null, 'productView confirm');

  const removed = ['p_gribnoy_sup', 'p_gusarskiy_salat', 'p_kasha_molochnaya_risovaya', 'p_govyadiny_iz_karpachcho', 'p_morkovnyy_tort', 'p_gustoy_kisel'];
  for (const id of removed) {
    assert.equal(byId(id), undefined, id);
  }

  const dish = new Set(lex.blockers.filter((g) => g.kind === 'dish').flatMap((g) => g.words));
  const ids = [];
  for (const p of P) {
    if (p.kind !== 'product') continue;
    const words = [];
    const addW = (s) => {
      if (!s) return;
      s.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/).forEach((w) => { if (w) words.push(w); });
    };
    addW(p.name_ru);
    if (p.synonyms) p.synonyms.forEach(addW);
    if (words.some((w) => dish.has(w))) ids.push(p.id);
  }
  ids.sort();
  assert.deepEqual(ids, ['p_detskaya_kasha', 'p_detskoe_pitanie', 'p_kartofelnoe_pyure', 'p_listovoy_salat', 'p_salat'], 'dish ids');
});

// п. 7: вода колодезная
test('п. 7: вода колодезная', async () => {
  const names = ['вода колодезная', 'колодезная вода', 'вода из колодца', 'вода скважинная', 'вода из скважины', 'родниковая вода', 'вода родниковая'];
  for (const n of names) {
    const r = m(n);
    assert.equal(r.status, 'ok', n);
    assert.equal(r.entry.id, 'p_voda_kolodeznaya', n);
    assert.equal(r.entry.norm.fresh, null, n);
    assert.equal(r.entry.intervention, 'nrb2009_app2a', n);
    assert.ok(r.entry.name_ru.includes('не упакованная'), n);
    assert.equal(pick(n).group.code, 'water', n);
    assert.equal(pick(n).status, 'not_established', n);
  }

  const input = inputFor('', 'вода колодезная', [['Cs-137', 5], ['Sr-90', 2], ['K-40', 40]]);
  const r = computeScenario(data, input);
  assert.ok(r.ok, 'r.ok');
  assert.equal(r.limits.ruNone, true, 'ruNone');
  assert.equal(r.limits.ru.length, 0, 'ru.length');
  assert.equal(r.limits.compliance, null, 'compliance');
  assert.equal(r.limits.intervention.length, 3, 'intervention.length');

  const recCs = data.dose_coeff.find((d) => d.id === 'nrb2009_app2a_cs137_water_adult');
  const recSr = data.dose_coeff.find((d) => d.id === 'nrb2009_app2a_sr90_water_adult');

  const rowCs = r.limits.intervention.find((x) => x.nuclide === 'Cs-137');
  assert.ok(Math.abs(rowCs.uv - recCs.uv_bq_per_kg) < 1e-12, 'Cs uv');
  assert.ok(Math.abs(rowCs.ratio - (5 / recCs.uv_bq_per_kg)) < 1e-12, 'Cs ratio');

  const rowSr = r.limits.intervention.find((x) => x.nuclide === 'Sr-90');
  assert.ok(Math.abs(rowSr.uv - recSr.uv_bq_per_kg) < 1e-12, 'Sr uv');
  assert.ok(Math.abs(rowSr.ratio - (2 / recSr.uv_bq_per_kg)) < 1e-12, 'Sr ratio');

  const rowK = r.limits.intervention.find((x) => x.nuclide === 'K-40');
  assert.equal(rowK.uv, null, 'K uv');
  assert.equal(rowK.ratio, null, 'K ratio');

  assert.equal(m('вода питьевая бутилированная').entry.norm.fresh, 't044_water_cs137', 'вода питьевая norm');
  const r2 = computeScenario(data, inputFor('water', 'вода питьевая бутилированная', [['Cs-137', 5]]));
  assert.equal(r2.limits.intervention, null, 'вода питьевая intervention');

  const html = strip(await renderJsx('src/react/Result.jsx', 'default', { result: r, input, meta: { datasets: 0, records: 0, sha: '00000000' }, initialTab: 'uv' }));
  assert.ok(html.includes(T.VERDICT_UV), 'VERDICT_UV');
  assert.ok(html.includes('Уровни вмешательства'), 'Уровни вмешательства');
  assert.ok(html.includes('НРБ-99/2009'), 'НРБ-99/2009');
  assert.ok(html.includes(T.UV_NOT_SET), 'UV_NOT_SET');
  assert.ok(html.includes(fmtNum(recCs.uv_bq_per_kg)), 'fmtNum Cs');
});

// п. 8: дополнения словаря
test('п. 8: дополнения словаря', () => {
  const ADDED = [
    ['рапсовое масло', 'p_maslo_rapsovoe'], ['масло соевое', 'p_maslo_soevoe'], ['сиг', 'p_sig'], ['язь', 'p_yaz'],
    ['хариус', 'p_khariys'], ['килька', 'p_kilka'], ['жимолость', 'p_zhimolost'], ['плотва', 'p_plotva'],
    ['камбала', 'p_kambala'], ['кета', 'p_keta'], ['перепелка', 'p_perepel'], ['индюшка', 'p_indeyka'],
    ['бобр', 'p_bobr'], ['редька черная', 'p_redka'], ['пастернак', 'p_pasternak'], ['батат', 'p_batat'],
    ['цукини', 'p_tsukkini'], ['авокадо', 'p_avokado'], ['изюм', 'p_izyum'], ['костяника', 'p_kostyanika'],
    ['булгур', 'p_bulgur'], ['нут', 'p_nut'], ['смалец', 'p_smalets'], ['кумыс', 'p_kumys'],
    ['мацони', 'p_matsoni'], ['имбирь', 'p_imbir'], ['зверобой', 'p_zveroboy'], ['семечки подсолнечные', 'p_podsolnechnika_semechki'],
    ['икра черная', 'p_zernistaya_ikra'], ['нори', 'p_vodorosli'], ['рожь', 'p_ozimaya_rozh'], ['паприка', null]
  ];

  for (const [name, id] of ADDED) {
    if (id !== null) {
      const r = m(name);
      assert.equal(r.status, 'ok', name);
      assert.equal(r.entry.id, id, name);
    } else {
      assert.equal(m(name).status, 'ambiguous', name);
    }
  }

  assert.equal(m('сиг').entry.diet.group, 'fish_river', 'сиг group');
  assert.equal(m('сиг').entry.norm.fresh, 't021_p4_r03_cs137', 'сиг norm');
  assert.equal(m('килька').entry.diet.group, 'fish', 'килька group');
  assert.equal(m('костяника').entry.norm.fresh, 't021_p4_r16_cs137', 'костяника norm');
  assert.equal(m('жимолость').entry.norm.fresh, null, 'жимолость norm');
  assert.equal(m('жимолость').entry.diet.group, 'fruit', 'жимолость group');
  assert.equal(m('изюм').entry.diet.base, false, 'изюм base');
  assert.equal(m('рапсовое масло').entry.norm.fresh, 't021_p4_r20_cs137', 'рапсовое norm');
  assert.equal(m('кумыс').entry.norm.fresh, 't021_p4_r05_cs137', 'кумыс norm');
  assert.equal(m('перепелка').entry.norm.fresh, 't021_p4_r01_cs137', 'перепелка norm');
  assert.equal(m('бобр').entry.norm.fresh, 't021_p4_r02_cs137', 'бобр norm');
  assert.equal(m('редька черная').entry.norm.fresh, 't021_p4_r13_cs137', 'редька norm');
  assert.equal(m('булгур').entry.norm.fresh, 't021_p4_r15_cs137', 'булгур norm');

  for (const [name, id] of ADDED) {
    if (id === null) continue;
    const p = byId(id);
    assert.deepEqual(p.transfer, [], name + ' transfer');
    assert.equal(typeof p.note, 'string', name + ' note');
  }

  const nowOk = ['мёд липовый', 'домашний мёд', 'рис бурый', 'рис белый', 'сыр моцарелла', 'козий сыр', 'брусничное варенье', 'варенье малиновое', 'рыба копчёная', 'кукуруза консервированная', 'гусиное мясо', 'лекарственные травы', 'берёзовый сок домашний', 'форель речная', 'каша детская молочная', 'черника замороженная', 'клюква замороженная', 'капуста красная', 'дикий кабан', 'мясо дикого кабана', 'сало свиное', 'орех фундук', 'сыворотка молочная', 'грибы солёные', 'дикая малина', 'дикая смородина', 'дикая клубника'];
  for (const n of nowOk) {
    assert.equal(m(n).status, 'ok', n);
  }

  const notOk = ['пельмени', 'борщ', 'каша гречневая', 'котлеты', 'картохи', 'молочко', 'каратофель', 'сок яблочный', 'компот', 'джем'];
  for (const n of notOk) {
    assert.equal(m(n).status, 'unknown', n);
  }

  // v12 fixes this
  assert.notEqual(m('белая рыба').status, 'ok', 'белая рыба');
});

// п. 9: миграция сохранённого состояния
test('п. 9: миграция сохранённого состояния', () => {
  const back = (portionG, extra = {}) => {
    const old = { ...S.initialRaw(ch), portionG, ...extra };
    delete old.dietMode;
    return restore(serialize(old, 1), S.initialRaw(ch), ch.nuclides).raw;
  };

  const emptyMass = ['100', '100.0', 100, 100.0, '100,0', ' 100 ', '100.00'];
  for (const v of emptyMass) {
    const r = back(v);
    assert.equal(r.dietMode, 'default', String(v));
    assert.equal(r.portionG, '', String(v));
  }

  const missing = ['', undefined, null];
  for (const v of missing) {
    const r = back(v);
    assert.equal(r.dietMode, 'default', String(v));
    assert.equal(r.portionG, '', String(v));
  }

  const ownMass = ['150', '99.9', '1000', 150, 'abc', '10'];
  for (const v of ownMass) {
    const r = back(v);
    assert.equal(r.dietMode, 'own', String(v));
    if (typeof v === 'string') {
      assert.equal(String(r.portionG), String(v), String(v));
    }
  }

  // миграция только для состояния БЕЗ поля mode
  const rXyz = restore(serialize({ ...S.initialRaw(ch), dietMode: 'xyz', portionG: '' }, 0), S.initialRaw(ch), ch.nuclides).raw;
  assert.equal(rXyz.dietMode, 'own', 'xyz');

  const rHigh = restore(serialize({ ...S.initialRaw(ch), dietMode: 'high', portionG: '' }, 0), S.initialRaw(ch), ch.nuclides).raw;
  assert.equal(rHigh.dietMode, 'high', 'high');
});

// п. 10: детская справка без «Взрослый»
test('п. 10: детская справка без «Взрослый»', async () => {
  const mk = (product, over = {}) => {
    let r = S.setField(S.setField(S.initialRaw(ch), ch, 'measuredForm', 'fresh'), ch, 'product', product);
    for (const [k, v] of Object.entries(over)) r = S.setField(r, ch, k, v);
    return r;
  };
  const page = async (raw) => renderJsx('src/react/Form.jsx', 'default', { choices: ch, raw, setRaw() {}, tab: 1, setTab() {}, onPreset() {}, onExport() {} });

  for (const age of ['1y', '10y']) {
    const html = await page(mk('Молоко', { age }));
    const start = html.indexOf('id="dietChild"');
    assert.ok(start !== -1, 'dietChild start ' + age);
    const end = html.indexOf('</details>', start);
    assert.ok(end !== -1, 'dietChild end ' + age);
    const frag = html.slice(start, end);

    const thCount = (frag.match(/<th[ >]/g) || []).length;
    assert.equal(thCount, 3, 'th count ' + age);

    const tbodyStart = frag.indexOf('<tbody>');
    const firstTrStart = frag.indexOf('<tr', tbodyStart);
    const firstTrEnd = frag.indexOf('</tr>', firstTrStart);
    const firstTr = frag.slice(firstTrStart, firstTrEnd);
    const tdCount = (firstTr.match(/<td/g) || []).length;
    assert.equal(tdCount, 3, 'td count ' + age);

    const stripped = strip(frag);
    assert.ok(!stripped.includes('Взрослый'), 'Взрослый ' + age);
    assert.ok(stripped.includes('НКДАР ООН 2000'), 'НКДАР ' + age);
  }

  assert.equal(T.DIET_CHILD_COLS.length, 3, 'DIET_CHILD_COLS length');
  assert.ok(!T.DIET_CHILD_COLS.includes('Взрослый'), 'DIET_CHILD_COLS Взрослый');
});

// п. 11: зелёный чай без «Зелень»
test('п. 11: зелёный чай без «Зелень»', () => {
  const names = ['чай зелёный', 'чай зеленый', 'зелёный чай'];
  for (const n of names) {
    const r = m(n);
    assert.equal(r.status, 'ok', n);
    assert.equal(r.entry.id, 'p_chay_zelenyy', n);
    assert.ok(!r.candidates.some((c) => c.id === 'p_zelen'), n);
  }

  assert.equal(m('зелень').entry.id, 'p_zelen', 'зелень');
  assert.equal(m('зелёный лук').entry.id, 'p_zelenyy_luk', 'зелёный лук');
  assert.equal(m('лук зеленый').entry.id, 'p_zelenyy_luk', 'лук зеленый');
  assert.equal(m('горошек зелёный').entry.id, 'p_goroshek_zelenyy', 'горошек зелёный');
  assert.equal(m('чай').entry.id, 'p_chay_chernyy', 'чай');

  const words = ['зеленый', 'зеленая', 'зеленые', 'зеленого'];
  const val = lex.forms['зеленый'];
  assert.notEqual(val, undefined, 'зеленый form');
  for (const w of words) {
    assert.equal(lex.forms[w], val, w);
  }
  assert.equal(lex.forms['зелень'], undefined, 'зелень form');
});

// п. 12: купленная речная рыба
test('п. 12: купленная речная рыба', () => {
  const river = P.filter((p) => p.kind === 'product' && p.diet.group === 'fish_river' && p.synonyms && p.synonyms[0] && !p.synonyms[0].includes(' '));
  let count = 0;
  const refVal = pick('форель').rec.value;

  for (const p of river) {
    const q = p.synonyms[0] + ' покупная';
    const r = m(q);
    assert.equal(r.status, 'ok', q);
    assert.equal(r.entry.id, p.id, q);
    assert.equal(r.regroup, 'fish', q);
    assert.equal(pick(q).group.code, 'fish', q);
    assert.equal(pick(q).status, 'default', q);
    assert.equal(pick(q).rec.value, refVal, q);

    assert.equal(pick(p.synonyms[0]).group.code, 'fish_river', p.synonyms[0]);
    assert.equal(pick(p.synonyms[0]).status, 'not_established', p.synonyms[0]);
    count++;
  }
  assert.ok(count >= 12, 'count: ' + count);

  const explicit = ['щука покупная', 'покупная щука', 'лещ покупной', 'судак покупной', 'сом покупной'];
  for (const n of explicit) {
    const r = m(n);
    assert.equal(r.status, 'ok', n);
    assert.equal(r.regroup, 'fish', n);
    assert.equal(pick(n).group.code, 'fish', n);
  }

  assert.equal(m('форель покупная').entry.id, 'p_forel', 'форель покупная id');
  assert.equal(pick('форель покупная').group.code, 'fish', 'форель покупная group');
  assert.ok(m('форель покупная').regroup == null, 'форель покупная regroup');

  assert.ok(m('картофель покупной').regroup == null, 'картофель regroup');
});
