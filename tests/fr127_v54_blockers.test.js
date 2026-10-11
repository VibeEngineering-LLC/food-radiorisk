// #FR-127 (v54): блокеры двух стерильных проходов перед публикацией (A-Б1…Б3, B-1…B-5, тексты, оговорки радона). Каждый тест красный на e4dc6af и зелёный после правки.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { loadJsx } from './render_helper.js';
import { unitRu } from '../src/ui/ru.js';
import { plural, WORDS, T } from '../src/ui/texts_v.js';
import { nb, fmtDose } from '../src/ui/fmt.js';
import { summarySets } from '../src/calc/summary_sets.js';
import { startAge, horizonYears } from '../src/calc/compare.js';
import { NOMINAL_AGE } from '../src/calc/years.js';
import { buildReport } from '../src/ui/report.js';
import { summaryParts } from '../src/ui/summary_text.js';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const UNPACKED = 'Питьевая вода неупакованная (из-под крана, колодец, скважина, родник)';
const PACKED = 'Вода питьевая упакованная (бутилированная)';
const MINERAL = 'Вода минеральная';
const A = 10, VOLUME_KG = 2 * 365;
const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const TABS = ['sum', 'cmp', 'life', 'norms', 'calc', 'site', 'spec', 'src'];
const WHEN = '2026-10-10T12:00:00.000Z';
const close = (a, b, rel = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg} получено ${a}, ожидалось ${b}`);
const water = (name, nuc, over = {}) => inputFor('water', name, nuc, { portionKg: 2, portionsPerYear: 365, ...over });
const run = (name, nuc, over) => computeScenario(data, water(name, nuc, over));
const strip = (h) => h.replace(/<[^>]+>/g, ' ');
const flat = (h) => strip(h).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/[\s  ]+/g, ' ').trim();
const report = (format, input, result) => strip(buildReport(format, { input, result }, META, WHEN).text);
const CJK = /[㐀-鿿]/;
let R;
const view = async (result, input, tab) => { R ??= await loadJsx('src/react/Result.jsx', 'default'); return R.render({ result, input, meta: META, initialTab: tab }); };
const viewRaw = async (result, input, tab) => { R ??= await loadJsx('src/react/Result.jsx', 'default'); return R.renderRaw({ result, input, meta: META, initialTab: tab }); }; // renderRaw — разметка с неразрывными пробелами (render их заменяет обычными)
test.after(async () => { if (R) await R.done(); });

// ---------- A-Б1 ----------
test('A-Б1: запись jp_cs_drinking_water — по-русски, без иероглифов, имени файла PDF и служебных пометок', () => {
  const rec = data.limits_foreign.find(r => r.id === 'jp_cs_drinking_water');
  for (const f of ['sum_rule', 'loc', 'document', 'status', 'edition']) {
    const v = String(rec[f] ?? '');
    assert.ok(!CJK.test(v), `${f}: иероглифы`);
    assert.ok(!/\.pdf\b/i.test(v), `${f}: имя файла`);
    assert.ok(!/не читался|CAA English|слайд 4/.test(v), `${f}: служебная пометка`);
  }
  assert.match(rec.loc, /Агентство по делам потребителей Японии, справка о нормативе радиоактивного цезия; Министерство здравоохранения Японии, питьевая вода 10 Бк\/кг/);
});

test('A-Б1: на экране «Соответствие нормам» (вода × Cs-137, раскрытое «подробнее») нет иероглифов, имён PDF и «не читался»', async () => {
  for (const name of [UNPACKED, PACKED, MINERAL]) for (const region of ['world', 'ru']) {
    const input = water(name, [['Cs-137', 5], ['Cs-134', 2]], { region });
    const result = computeScenario(data, input);
    assert.ok(result.ok, result.errors?.join('; '));
    const t = strip(await view(result, input, 'norms'));
    assert.ok(/подробнее/.test(t), 'раскрывающийся блок есть');
    assert.ok(!CJK.test(t), `${name}/${region}: иероглифы`);
    assert.ok(!/\.pdf\b|не читался|CAA English/i.test(t), `${name}/${region}: служебные пометки`);
  }
});

// ---------- A-Б2 ----------
test('A-Б2: единица «days» переводится в «сут» (словарь и экран «Место сбора и величины» при распаде)', async () => {
  assert.equal(unitRu('days'), 'сут');
  const input = inputFor('milk', 'молоко', [['Cs-137', 100]], { portionKg: 0.5, portionsPerYear: 365, years: 3, eatDate: '2026-06-01' });
  input.nuclides[0].sampleDate = '2026-01-01';
  const result = computeScenario(data, input);
  assert.ok(result.ok, result.errors?.join('; '));
  for (const tab of ['site', 'calc']) assert.ok(!/\bdays\b/.test(strip(await view(result, input, tab))), `вкладка ${tab}`);
  for (const format of ['md', 'html']) assert.ok(!/\bdays\b/.test(report(format, input, result)), `отчёт ${format}`);
});

// ---------- A-Б3 ----------
test('A-Б3: unscear2000_rnw_equilibrium_f — без «OCR потеряно», место «Приложение B, пп. 153, 157», без отметки «не подтверждено»', async () => {
  const rec = data.risk.find(r => r.id === 'unscear2000_rnw_equilibrium_f');
  assert.ok(!/OCR|потеряно/i.test(`${rec.loc} ${rec.status_2026} ${rec.quote}`));
  assert.match(rec.loc, /Приложение B, пп\. 153, 157/);
  assert.notEqual(rec.level, '⚠️');
  const input = water(UNPACKED, [['Rn-222', A]]), result = computeScenario(data, input);
  const t = strip(await view(result, input, 'site'));
  assert.ok(!/OCR|⚠/.test(t));
});

// ---------- B-1 ----------
test('B-1: норматив ЕС 1000 Бк/л — «меры считаются оправданными», слова «обязательны» нет ни на экране, ни в данных, ни в тексте', async () => {
  const input = water(UNPACKED, [['Rn-222', 30]]), result = computeScenario(data, input);
  const t = flat(await view(result, input, 'norms'));
  assert.ok(!/меры по снижению[^.]{0,20}обязательн/.test(t), 'обязательны на экране');
  assert.match(t, /меры по снижению считаются оправданными без дальнейшего обоснования/);
  const rec = data.limits_foreign.find(r => r.id === 'eu_2013_51_rn222_remedial');
  assert.ok(!/обязательн/.test(rec.sum_rule), rec.sum_rule);
  assert.match(rec.sum_rule, /оправданными/);
  assert.ok(!/снижению (радона )?обязательны/.test(read('src/react/RadonWater.jsx') + read('public/data/limits_foreign.json')));
});

// ---------- B-2 ----------
test('B-2: Rn-222 не входит ни в один агрегат (Ē₅, доза, риск, сравнение, эквиваленты, сектор «Этот продукт»); Cs-137 + Rn-222 = Cs-137', async () => {
  const cs = run(UNPACKED, [['Cs-137', 5]]), both = run(UNPACKED, [['Cs-137', 5], ['Rn-222', A]]);
  for (const k of ['doseSvPerYear', 'doseSvTotal', 'doseSvAvg5', 'doseSvMaxYear', 'riskTotal', 'riskPerYear']) close(both.totals[k], cs.totals[k], 1e-12, k);
  close(both.totals.doseTechAvg5, both.totals.doseSvAvg5, 1e-12, 'Ē₅ с радоном и без — одно число');
  assert.ok(both.rows.some(r => r.nuclide === 'Rn-222'), 'строка нуклида радона остаётся');
  close(both.radon.ingestion.doseSvPerYear, A * VOLUME_KG * 3.5e-9, 1e-12);
  const prod = (r) => r.comparison.rows.find(x => x.id === 'product');
  close(prod(both).doseSv, prod(cs).doseSv, 1e-12, 'доза продукта в сравнении');
  close(both.comparison.equivalents.bgDays, cs.comparison.equivalents.bgDays, 1e-12, 'эквивалент в днях фона');
  close(both.comparison.equivalents.chestXrays, cs.comparison.equivalents.chestXrays, 1e-12, 'эквивалент в снимках');
  assert.deepEqual(both.comparison.natural, [], 'в сравнении радон не назван природной составляющей дозы продукта');
  close(both.lifeRisks.lifetime.rows.find(x => x.id === 'product').p, cs.lifeRisks.lifetime.rows.find(x => x.id === 'product').p, 1e-12);
  const opts = { radonC: NaN, dwellU: NaN, ctN: NaN, xrayN: NaN, flightN: 1 };
  const sp = (r, i) => summarySets(r, i, opts).ds.slices.find(s => s.id === 'product');
  const inBoth = water(UNPACKED, [['Cs-137', 5], ['Rn-222', A]]), inCs = water(UNPACKED, [['Cs-137', 5]]);
  close(sp(both, inBoth).doseSv, sp(cs, inCs).doseSv, 1e-12, 'доза сектора');
  close(sp(both, inBoth).riskP, sp(cs, inCs).riskP, 1e-12, 'риск сектора');
  const spec = flat(await view(both, inBoth, 'spec'));
  const e5 = [...spec.matchAll(/Ē₅ за 5 лет подряд ([\d, ]+ мкЗв)/g)].map(m => m[1]);
  assert.ok(e5.length >= 1);
  const csE5 = flat(fmtDose(cs.totals.doseSvAvg5)), withRn = flat(fmtDose(cs.totals.doseSvAvg5 + A * VOLUME_KG * 3.5e-9 / 5));
  assert.ok(e5.every(x => x === csE5), `Ē₅ на экране ${e5.join('|')} ожидалось ${csE5}`);
  assert.ok(!spec.includes(withRn), 'Ē₅ с радоном на экране');
  const sum = flat(await view(both, inBoth, 'sum'));
  assert.ok(!/Rn-222\)/.test(sum), 'в подписи сектора продукта нет Rn-222');
  assert.ok(!/Этот продукт[^;]{0,120}Rn-222/.test(sum));
});

test('B-2: только Rn-222 — расчёт ок, агрегатов нет (null), радон только в своём блоке; ни одна вкладка не падает и не печатает NaN', async () => {
  for (const name of [UNPACKED, PACKED, MINERAL]) for (const region of ['world', 'ru']) {
    const input = water(name, [['Rn-222', A]], { region }), result = computeScenario(data, input);
    assert.ok(result.ok, result.errors?.join('; '));
    assert.equal(result.totals.doseSvPerYear, null);
    assert.equal(result.totals.doseSvTotal, null);
    assert.equal(result.totals.riskTotal, null);
    assert.equal(result.totals.riskNominal, null);
    assert.equal(result.comparison, null);
    assert.ok(result.radon, 'блок радона есть');
    for (const tab of TABS) {
      const t = flat(await view(result, input, tab));
      assert.ok(!/NaN|undefined|\[object|— мкЗв|— Зв/.test(t), `${name}/${region}/${tab}`);
    }
    for (const format of ['md', 'html']) assert.ok(!/NaN|undefined|— мкЗв/.test(report(format, input, result)), `отчёт ${format}`);
  }
});

// ---------- B-3 / B-4 ----------
test('B-3: вдыхание — только для неупакованной воды; для упакованной и минеральной строки нет и сказано почему', async () => {
  const un = run(UNPACKED, [['Rn-222', 100]]);
  assert.ok(un.radon.inhalation && un.radon.inhalation.doseSvPerYear > 0);
  for (const name of [PACKED, MINERAL]) {
    const input = water(name, [['Rn-222', 100]]), r = computeScenario(data, input);
    assert.equal(r.radon.inhalation, null, name);
    assert.ok(r.radon.ingestion.doseSvPerYear > 0, 'питьё считается');
    const t = flat(await view(r, input, 'norms'));
    assert.ok(!/Вдыхание радона, выделившегося из воды/.test(t), `${name}: строка вдыхания`);
    assert.match(t, /водопроводной воды/);
    assert.ok(!/переход из воды в воздух/i.test(t), 'формула вдыхания не показана');
    for (const format of ['md', 'html']) assert.ok(!/Вдыхание радона, выделившегося из воды/.test(report(format, input, r)), `отчёт ${format}`);
  }
  const input = water(UNPACKED, [['Rn-222', 100]]);
  assert.match(flat(await view(un, input, 'norms')), /Вдыхание радона, выделившегося из воды/);
});

test('B-4: Rn-222 в продукте, не являющемся водой — ни дозы, ни строки, ни сектора; только предупреждение', async () => {
  const input = inputFor('milk', 'молоко', [['Cs-137', 5], ['Rn-222', A]], { portionKg: 0.5, portionsPerYear: 365 });
  const r = computeScenario(data, input);
  assert.ok(r.ok, r.errors?.join('; '));
  assert.ok(!r.rows.some(x => x.nuclide === 'Rn-222'), 'строки радона нет');
  assert.equal(r.radon, null);
  assert.ok(r.warnings.some(w => /Радон-222 рассчитывается только для питьевой воды/.test(w)), r.warnings.join(' | '));
  const cs = computeScenario(data, inputFor('milk', 'молоко', [['Cs-137', 5]], { portionKg: 0.5, portionsPerYear: 365 }));
  close(r.totals.doseSvPerYear, cs.totals.doseSvPerYear, 1e-12);
  for (const tab of TABS) {
    const t = flat(await view(r, input, tab));
    assert.ok(!/Rn-222/.test(t), `вкладка ${tab}: Rn-222`);
  }
  const only = computeScenario(data, inputFor('milk', 'молоко', [['Rn-222', A]], { portionKg: 0.5, portionsPerYear: 365 }));
  assert.equal(only.ok, false);
  assert.ok(only.errors.some(e => /Радон-222 рассчитывается только для питьевой воды/.test(e)), only.errors.join(' | '));
});

// ---------- B-5 ----------
test('B-5: вёрстка 360 px — ряд кнопок переносится, подписи шкалы риска не перекрываются (правила CSS)', () => {
  const win = read('src/ui/window.css'), css = read('src/ui/styles.css');
  const cmds = win.split('\n').find(l => l.startsWith('.statusbar .cmds'));
  assert.ok(cmds && /flex-wrap:\s*wrap/.test(cmds), `.statusbar .cmds: ${cmds}`);
  assert.ok(/max-width:\s*100%/.test(cmds) || /min-width:\s*0/.test(cmds), 'ряд не шире строки состояния');
  const media = css.match(/@media \(max-width: 4\d\dpx\)\s*\{[^@]*\.scalelbl[^@]*\}/);
  assert.ok(media, 'для узкого экрана у подписей шкалы свои правила');
  assert.match(media[0], /\.scalelbl span:last-child[^}]*top:/, 'последняя подпись уходит на вторую строку');
});

// ---------- тексты ----------
test('Т-4: ссылка на «Уровни вмешательства» называет существующую вкладку', () => {
  assert.ok(!/вкладка «Уровни вмешательства»/.test(T.VERDICT_UV), T.VERDICT_UV);
  assert.match(T.VERDICT_UV, /вкладк[а-я]+ «Соответствие нормам»/);
});

test('Т-5: «п. 5.3.5 (п. 5.3.5)» не повторяется, у двух строк уровней вмешательства РФ разные названия', async () => {
  const input = water(UNPACKED, [['Rn-222', 30]]), result = computeScenario(data, input);
  const t = flat(await view(result, input, 'norms'));
  assert.ok(!/п\. 5\.3\.5\)?[^.]{0,6}\(п\. 5\.3\.5\)/.test(t), 'дубль п. 5.3.5');
  const names = [...t.matchAll(/Уровень вмешательства[^,]{0,40}, Российская Федерация/g)].map(m => m[0]);
  assert.ok(names.length >= 2 && new Set(names).size === names.length, names.join(' | '));
});

test('Т-7: провенанс дозового коэффициента для воды не говорит «при поступлении с пищей»', () => {
  const r = run(UNPACKED, [['Rn-222', A], ['Cs-137', 5]]);
  for (const row of r.rows) {
    const p = row.provenance.find(x => x.step === 'доза');
    assert.ok(!/с пищей/.test(p.what), `${row.nuclide}: ${p.what}`);
    assert.match(p.what, /водой/);
  }
  const milk = computeScenario(data, inputFor('milk', 'молоко', [['Cs-137', 5]], { portionKg: 0.5, portionsPerYear: 365 }));
  assert.match(milk.rows[0].provenance.find(x => x.step === 'доза').what, /пищей/);
});

test('Т-8: согласование «снимок» с числом: 1 / 2–4 / 5+ / 11–14 / дробное', () => {
  const f = (s) => plural(s, WORDS.xray);
  assert.equal(f('1'), 'рентгеновский снимок');
  assert.equal(f('2'), 'рентгеновских снимка');
  assert.equal(f('4'), 'рентгеновских снимка');
  assert.equal(f('5'), 'рентгеновских снимков');
  assert.equal(f('11'), 'рентгеновских снимков');
  assert.equal(f('21'), 'рентгеновский снимок');
  assert.equal(f('0,5'), 'рентгеновского снимка');
});

test('Т-9: число и единица в текстах радона и данных — неразрывным пробелом (нЗв, суток)', async () => {
  const input = water(UNPACKED, [['Rn-222', 30]]), result = computeScenario(data, input);
  const rx = /\d [нм]к?Зв|\d суток|\d сут(?![а-яё])/;
  for (const k of Object.keys(T).filter(k => k.startsWith('RN_'))) assert.ok(!rx.test(T[k]), `${k}: ${T[k].match(rx)?.[0]}`);
  for (const tab of ['norms', 'site', 'calc']) {
    const t = strip(await viewRaw(result, input, tab));
    assert.ok(!rx.test(t), `${tab}: «${t.match(rx)?.[0]}»`);
  }
  assert.ok(!rx.test(nb('3,5 нЗв/Бк, 3,8232 суток, 9 нЗв/(Бк·ч·м⁻³), более 10 суток')));
});

test('Т-11: возраст начала потребления взрослого — один (20 лет) на «Сводке», «Бытовых рисках» и в расчёте риска «на всю жизнь»; горизонт 50 лет', () => {
  assert.equal(startAge({ age: 'adult' }), NOMINAL_AGE.adult);
  assert.equal(horizonYears({ age: 'adult' }), 50);
  const r = run(UNPACKED, [['Cs-137', 5]]);
  const lt = r.lifeRisks.lifetime;
  assert.equal(r.eating.fromAge, lt.a);
  assert.equal(r.eating.toAge, lt.b);
  assert.equal(r.eating.toAge - r.eating.fromAge, 50);
  assert.equal(lt.b, 70);
});

// ---------- оговорки радона (B-модель) ----------
test('B-модель (а)(б): 90 % ВОЗ относится к 60 л/год сырой водопроводной воды; радон из воды уже в измеренной ОА радона в жилище', async () => {
  const input = water(UNPACKED, [['Rn-222', 30]]), result = computeScenario(data, input);
  const t = flat(await view(result, input, 'norms'));
  assert.match(t, /около 90 %/);
  assert.match(t, /60 л/);
  assert.match(t, /сырой водопроводной воды/);
  assert.match(t, /уже входит в измеренную объёмную активность радона в жилище/);
  assert.match(t, /Радон в жилище/);
  assert.match(t, /п\. 157/);
  assert.match(report('md', input, result), /уже входит в измеренную объёмную активность радона в жилище/);
});

test('B-модель (в): ссылки на ВОЗ — гл. 9 вводная часть и разд. 9.7.1, а не «Box 9.5»', () => {
  const share = data.risk.find(r => r.id === 'who_gdwq2017_rnw_inhalation_share');
  const ratio = data.risk.find(r => r.id === 'unscear2000_rnw_air_water_ratio');
  assert.ok(!/Box 9\.5/.test(`${share.loc} ${share.status_2026} ${ratio.status_2026} ${ratio.loc}`));
  assert.match(share.loc, /вводная часть/);
  assert.match(share.loc, /9\.7\.1/);
  assert.match(ratio.status_2026, /9\.7\.1/);
  const who = data.limits_foreign.find(r => r.id === 'who_gdwq2017_rn222_no_guidance');
  assert.ok(!/Box 9\.5/.test(who.loc));
  const src = JSON.parse(read('public/data/sources.json')).sources.WHO_GDWQ2017;
  assert.ok(!/Box 9\.5/.test(JSON.stringify(src)));
});

test('B-модель (г): карточка DDEP Rn-222 существует — запись периода полураспада на неё ссылается, без локальных путей', () => {
  const rec = data.nuclides.find(r => r.id === 'hl_rn222_ddep');
  const all = JSON.stringify(rec);
  assert.ok(!/недоступн|прочитать не удалось/.test(all), 'утверждение о недоступности карточки');
  assert.match(rec.source, /Table de Radionucl[ée]ides, Rn-222/);
  assert.equal(rec.half_life_days, 3.8232);
  assert.ok(!/(?<![A-Za-z])[A-Za-z]:[\\/]|\bLNE-LNHB\. Table/.test(all), 'локальный путь или имя локального файла в публичных данных');
});

// ---------- мелкие тексты (Т-10, Т-12, Т-13, Т-14) ----------
test('Т-10/Т-12/Т-13/Т-14: нет двойного пробела в словесной оценке, подсказка 10⁻⁶ — «пренебрежимо малого риска», «разница 0 мЗв» не пишется, T½ радона неупакованной воды — «не применяется»', async () => {
  const input = water(UNPACKED, [['Cs-137', 5], ['Rn-222', A]], { region: 'world', eatDate: '2026-10-11' });
  input.nuclides.forEach(n => { n.sampleDate = '2026-09-11'; });
  const result = computeScenario(data, input);
  const verbal = summaryParts(result, input).verbal;
  assert.ok(verbal && !/[ \u00a0]{2}/.test(verbal), JSON.stringify(verbal));
  assert.match(T.RISK_SCALE_TICK_NEGL, /пренебрежимо малого риска/);
  assert.ok(!/разница 0 мЗв/.test(flat(await view(result, input, 'sum'))), 'разница 0');
  assert.match(flat(await view(result, input, 'calc')), /T½ — период полураспада, сут не применяется/);
});
