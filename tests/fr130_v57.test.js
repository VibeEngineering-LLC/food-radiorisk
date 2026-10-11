// #FR-130 (v57): замечания независимых проверок v56 (проход B: 1, 4–9 и п. 2(а); проход A: Н-1, Н-2).
// Каждый тест красный на f97646a и зелёный после правки; боевые образцы — «Вода минеральная» + Cs-137/Sr-90, названия словаря, сценарии S3 и S7 проверки.
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario, listChoices } from '../src/calc/model.js';
import { loadJsx, renderJsx } from './render_helper.js';
import { buildReport } from '../src/ui/report.js';
import { T } from '../src/ui/texts_v.js';
import * as S from '../src/react/formState.js';
import { fmtPerMillion, fmtDose } from '../src/ui/fmt.js';

const UNPACKED = 'Питьевая вода неупакованная (из-под крана, колодец, скважина, родник)';
const PACKED = 'Вода питьевая упакованная (бутилированная)';
const MINERAL = 'Вода минеральная';
const CUSTOM = 'моя вода';
const CHOICE = 'Вода';
const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const WHEN = '2026-10-11T12:00:00.000Z';
const strip = (h) => h.replace(/<[^>]+>/g, ' ');
const flat = (h) => strip(h).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/[\s   ]+/g, ' ').trim();
const mk = (group, name, nuc, over = {}) => inputFor(group, name, nuc, { portionKg: 1, portionsPerYear: 336, region: 'world', eatDate: '2026-10-11', ...over });
const sampled = (input, date) => { input.nuclides.forEach(n => { n.sampleDate = date; }); return input; };
const run = (input) => { const r = computeScenario(data, input); assert.ok(r.ok, (r.errors || []).join('; ')); return r; };
const report = (input, result) => flat(buildReport('md', { input, result }, META, WHEN).text);
const rawOf = (r, n) => r.rows.find(x => x.nuclide === n).rawBqPerKg;
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');
const count = (text, re) => (text.match(re) || []).length;
const dietWater = (input) => { input.product.dietGroup = 'water'; return input; };
let R;
const view = async (result, input, tab) => { R ??= await loadJsx('src/react/Result.jsx', 'default'); return flat(R.render({ result, input, meta: META, initialTab: tab })); };
test.after(async () => { if (R) await R.done(); });

// ---------- п. 2(а): минеральная вода и зарубежные нормы для питьевой воды общественных систем водоснабжения ----------
const EPA = /^us_epa_mcl_/;
const FOREIGN_MINERAL = /Нормы Агентства по охране окружающей среды США \(40 CFR 141\.66\) установлены для питьевой воды общественных систем водоснабжения и к природной минеральной воде не относятся и не показаны/;
test('Минеральная вода (S3): EPA MCL 40 CFR 141.66 (общественные системы водоснабжения) для Cs-137, Sr-90 и Ra-226 не сравнивается; доза не меняется', () => {
  const nuc = [['Cs-137', 20], ['Sr-90', 5], ['Ra-226', 1]];
  const m = run(mk('water', MINERAL, nuc)), p = run(mk('water', PACKED, nuc));
  assert.deepEqual(m.limits.foreign.filter(l => EPA.test(l.id)), []);
  assert.ok(p.limits.foreign.some(l => l.id === 'us_epa_mcl_sr90_tableA') && p.limits.foreign.some(l => l.id === 'us_epa_mcl_ra226_228'), 'для упакованной воды сравнение остаётся');
  assert.equal(m.limits.foreignMineralNote, true);
  assert.equal(p.limits.foreignMineralNote, false);
  for (const n of ['Cs-137', 'Sr-90', 'Ra-226']) assert.equal(m.rows.find(x => x.nuclide === n).doseSvPerYear, p.rows.find(x => x.nuclide === n).doseSvPerYear, n);
});
test('Минеральная вода: нормы, относящиеся и к упакованной воде (ВОЗ, Япония, Евратом 2016/52, FDA 21 CFR 165.110), не тронуты — решение по данным и цитатам', () => {
  const ids = run(mk('water', MINERAL, [['Cs-137', 20], ['Sr-90', 5], ['Ra-226', 1]])).limits.foreign.map(l => l.id);
  for (const id of ['jp_cs_drinking_water', 'iaea_tecdoc1788_who_sr90_i131_cs_u238', 'eu_2016_52_a1_other_cs_liquid', 'eu_2016_52_a1_sr_liquid', 'us_fda_bottled_ra226_228']) assert.ok(ids.includes(id), id);
});
test('Минеральная вода (S3): пояснение о нормах для общественных систем водоснабжения — одно на блок «Нормы других стран» на экране и в отчёте; у упакованной воды его нет', async () => {
  const input = mk('water', MINERAL, [['Cs-137', 20], ['Sr-90', 5]]);
  const result = run(input);
  const t = await view(result, input, 'norms');
  assert.match(t, FOREIGN_MINERAL);
  assert.equal(count(t, /общественных систем водоснабжения/g), 1, 'на экране — ровно одна такая фраза');
  assert.equal(count(t, /141\.66/g), 1, 'в таблице норм строки EPA нет — номер только в пояснении');
  const rep = report(input, result);
  assert.match(rep, FOREIGN_MINERAL);
  assert.equal(count(rep, /общественных систем водоснабжения/g), 1, 'в отчёте — ровно одна');
  const pin = mk('water', PACKED, [['Cs-137', 20], ['Sr-90', 5]]);
  assert.doesNotMatch(await view(run(pin), pin, 'norms'), FOREIGN_MINERAL);
});
// ---------- замечание 1 и таблица комбинаций: [запись словаря, группа норм, группа рациона «вода»] → вид воды для радона либо ключ сообщения о пропуске ----------
const MATRIX = [
  [UNPACKED, null, false, { pack: 'unpacked', inh: true }],
  [UNPACKED, 'water', false, { pack: 'packaged', inh: false }],
  [UNPACKED, 'milk', false, { msg: 'RN_NOT_WATER_GROUP' }],
  [PACKED, null, false, { msg: 'RN_NOT_WATER_GROUP' }],
  [PACKED, 'water', false, { pack: 'packaged', inh: false }],
  [PACKED, 'milk', false, { msg: 'RN_NOT_WATER_GROUP' }],
  [MINERAL, null, false, { msg: 'RN_NOT_WATER_GROUP' }],
  [MINERAL, 'water', false, { pack: 'mineral', inh: false }],
  [MINERAL, 'milk', false, { msg: 'RN_NOT_WATER_GROUP' }],
  [CUSTOM, null, false, { msg: 'RN_NOT_WATER' }],
  [CUSTOM, null, true, { msg: 'RN_NOT_WATER_DIET' }],
  [CUSTOM, 'water', false, { pack: 'packaged', inh: false }],
  [CUSTOM, 'water', true, { pack: 'packaged', inh: false }],
  [CUSTOM, 'milk', false, { msg: 'RN_NOT_WATER' }],
  [CHOICE, null, false, { msg: 'RN_NOT_WATER_CHOICE' }],
  [CHOICE, 'water', false, { pack: 'packaged', inh: false }],
  [CHOICE, 'milk', false, { msg: 'RN_NOT_WATER_CHOICE' }]
];
test('Замечание 1: таблица «запись словаря × группа норм × группа рациона» — вид воды для радона согласован с выбранной группой норм', () => {
  const bad = [];
  for (const [name, group, diet, want] of MATRIX) {
    const input = mk(group, name, [['Rn-222', 100], ['Cs-137', 5]]);
    if (diet) dietWater(input);
    const r = computeScenario(data, input);
    const label = `${name} | группа ${group} | рацион ${diet ? 'вода' : '—'}`;
    if (!r.ok) { bad.push(`${label}: ошибка ${r.errors}`); continue; }
    if (want.pack) {
      if (r.radon?.packaging !== want.pack) bad.push(`${label}: packaging=${r.radon?.packaging}, ожидалось ${want.pack}`);
      if (!!r.radon?.inhalation !== want.inh) bad.push(`${label}: вдыхание=${!!r.radon?.inhalation}`);
    } else {
      const w = r.warnings.find(x => /Радон-222/.test(x));
      const exp = T[want.msg].split(/\{\w+\}/)[0].slice(0, 40);
      if (r.radon || r.rows.some(x => x.nuclide === 'Rn-222') || !w || !w.includes(exp)) bad.push(`${label}: ожидалось сообщение ${want.msg}; получено «${w}»`);
    }
  }
  assert.deepEqual(bad, []);
});
test('Замечание 1 (боевой образец): неупакованная вода + выбранная группа «Упакованная питьевая вода» — радон как для упакованной, показатель B по табл. 4 согласован', async () => {
  const input = sampled(mk('water', UNPACKED, [['Rn-222', 100], ['Cs-137', 20]]), '2026-10-01');
  const r = run(input);
  assert.equal(r.radon.packaging, 'packaged');
  assert.equal(r.radon.inhalation, null);
  assert.ok(Math.abs(rawOf(r, 'Rn-222') - 100 * Math.pow(2, -10 / 3.8232)) < 1e-9, 'распад от даты пробы применён');
  assert.ok(r.limits.compliance, 'B по табл. 4 выдан (упакованная вода)');
  assert.match(await view(r, input, 'norms'), /Строка вдыхания для упакованной воды не выводится/);
});
test('Замечание 4: RN_PACK_UNKNOWN и вид «unknown» убраны — вид воды для радона всегда определён', () => {
  assert.equal(T.RN_PACK_UNKNOWN, undefined);
  for (const f of ['src/react/RadonWater.jsx', 'src/ui/report.js', 'src/calc/radon_water.js']) assert.doesNotMatch(src(f), /PACK_UNKNOWN|rnPackUnknown|'unknown'/, f);
  for (const [name, group, diet] of MATRIX) {
    const input = mk(group, name, [['Rn-222', 100]]);
    if (diet) dietWater(input);
    const r = computeScenario(data, input);
    if (r.radon) assert.ok(['unpacked', 'packaged', 'mineral'].includes(r.radon.packaging), `${name}/${group}`);
  }
});
// сценарии, которыми достигаются все строки RN_*: экран «Соответствие нормам», отчёт, сообщения расчёта
const RN_SCENARIOS = () => [
  sampled(mk(null, UNPACKED, [['Rn-222', 100]]), '2026-10-01'),
  sampled(mk('water', PACKED, [['Rn-222', 100]]), '2026-10-01'),
  sampled(mk('water', PACKED, [['Rn-222', 100]]), '2026-10-25'),
  sampled(mk('water', PACKED, [['Rn-222', 100]]), '2026-10-13'),
  sampled(mk('water', PACKED, [['Rn-222', 100]]), '2026-08-01'),
  mk('water', MINERAL, [['Rn-222', 100]]),
  mk('milk', 'молоко', [['Cs-137', 5], ['Rn-222', 50]]),
  dietWater(mk(null, CUSTOM, [['Rn-222', 50], ['Cs-137', 5]])),
  mk('milk', MINERAL, [['Rn-222', 50], ['Cs-137', 5]]),
  mk(null, CHOICE, [['Rn-222', 50], ['Cs-137', 5]])
];
test('Замечание 4: каждая строка RN_* достижима хотя бы в одном сценарии (экран, отчёт или сообщение расчёта) — мёртвого текста нет', async () => {
  let all = '';
  for (const input of RN_SCENARIOS()) {
    const r = computeScenario(data, input);
    all += ` ${[...(r.errors || []), ...(r.warnings || [])].join(' ')} `;
    if (r.ok) all += ` ${await view(r, input, 'norms')} ${report(input, r)} `;
  }
  all = flat(all);
  const keys = Object.entries(T).filter(([k]) => /^RN_/.test(k));
  const chunk = (v) => flat(String(v)).split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0].trim().slice(0, 60);
  assert.deepEqual(keys.filter(([, v]) => !all.includes(chunk(v))).map(([k]) => k), []);
});
test('Замечание 5: сообщение «Радон-222 не рассчитан» при группе рациона «вода» сообщает, что у упакованной воды вдыхание не считается и применяется распад', () => {
  const r = run(dietWater(mk(null, CUSTOM, [['Rn-222', 50], ['Sr-90', 10]])));
  const w = r.warnings.find(x => /Радон-222 не рассчитан/.test(x));
  assert.ok(w, r.warnings.join(' | '));
  assert.match(w, /упакованной воды[^.]*вдыхание[^.]*не считается[^.]*распад/);
  assert.match(w, /выберите[^.]*в списке продуктов[^.]*или группу норм/);
});
const NO_BACK = /Радон-222: дата пробы позже даты начала потребления[^.]*не пересчитана назад/;
test('Замечание 6: проба позже начала на 1–3 сут (в пределах одного периода полураспада 3,8232 сут) — пересчёт назад как прежде, не выше измеренного ×2', () => {
  for (const [date, d] of [['2026-10-12', 1], ['2026-10-13', 2], ['2026-10-14', 3]]) {
    for (const name of [PACKED, MINERAL]) {
      const r = run(sampled(mk('water', name, [['Rn-222', 100]]), date));
      const want = 100 * Math.pow(2, d / 3.8232);
      assert.ok(Math.abs(rawOf(r, 'Rn-222') - want) < 1e-9, `${name}, ${d} сут: ${rawOf(r, 'Rn-222')} против ${want}`);
      assert.ok(rawOf(r, 'Rn-222') <= 200);
      assert.equal(r.radon.noBackExtrapolation, false, `${name}, ${d} сут`);
      assert.ok(r.warnings.some(w => /пересчитана назад/.test(w)), 'общее предупреждение о пересчёте назад есть');
    }
  }
});
test('Замечание 6: проба позже начала более чем на один период полураспада — активность измеренная, с пометкой; S7 (10 Бк/кг на 30 сут) остаётся 10', () => {
  for (const date of ['2026-10-15', '2026-10-25', '2026-11-10']) {
    const r = run(sampled(mk('water', PACKED, [['Rn-222', 10]]), date));
    assert.equal(rawOf(r, 'Rn-222'), 10, date);
    assert.equal(r.radon.noBackExtrapolation, true, date);
    assert.ok(r.rows[0].provenance.some(p => p.step === 'распад' && NO_BACK.test(p.note || '')), date);
  }
});
test('Замечание 6: пометка называет границу пересчёта (один период полураспада); Cs-137 назад пересчитывается без границы', async () => {
  assert.match(flat(T.RN_NO_BACK), /не более чем на один период полураспада/);
  const input = sampled(mk('water', PACKED, [['Rn-222', 10]]), '2026-11-10');
  assert.match(await view(run(input), input, 'norms'), /не более чем на один период полураспада/);
  const cs = run(sampled(mk('water', PACKED, [['Rn-222', 10], ['Cs-137', 10]]), '2026-11-10'));
  assert.equal(rawOf(cs, 'Rn-222'), 10);
  assert.ok(rawOf(cs, 'Cs-137') > 10);
});
test('Замечание 6 (контроль): неупакованная вода — активность принята измеренной при любой дате пробы, пометки нет', () => {
  for (const date of ['2026-10-13', '2026-11-10']) {
    const r = run(sampled(mk(null, UNPACKED, [['Rn-222', 10]]), date));
    assert.equal(rawOf(r, 'Rn-222'), 10);
    assert.ok(!r.radon.noBackExtrapolation);
  }
});
test('Замечание 7: минеральная вода при группе норм, не относящейся к воде, — сообщение называет продукт и что выбрать, а не «только для питьевой воды»', () => {
  const r = run(mk('milk', MINERAL, [['Rn-222', 50], ['Cs-137', 5]]));
  const w = r.warnings.find(x => /Радон-222/.test(x));
  assert.ok(w, r.warnings.join(' | '));
  assert.doesNotMatch(w, /только для питьевой воды/);
  assert.match(w, /«Вода минеральная»/);
  assert.match(w, /группа норм[^.]*не относится к питьевой воде/);
  assert.match(w, /Упакованная питьевая вода/);
});
test('Замечание 7: «Вода» без уточнения — сообщение просит выбрать вид воды в списке; если радон единственный нуклид — ошибка с тем же текстом', () => {
  const both = run(mk(null, CHOICE, [['Rn-222', 50], ['Cs-137', 5]]));
  const w = both.warnings.find(x => /Радон-222/.test(x));
  assert.ok(w, both.warnings.join(' | '));
  assert.doesNotMatch(w, /только для питьевой воды/);
  assert.match(w, /«Вода»[^.]*несколько видов воды/);
  assert.match(w, /выберите[^.]*в списке продуктов/);
  const only = computeScenario(data, mk(null, CHOICE, [['Rn-222', 50]]));
  assert.equal(only.ok, false);
  assert.match(only.errors[0], /несколько видов воды/);
});
test('Замечание 7 (контроль): молоко — прежнее сообщение «только для питьевой воды»', () => {
  const r = run(mk('milk', 'молоко', [['Cs-137', 5], ['Rn-222', 50]]));
  assert.ok(r.warnings.some(x => /Радон-222 рассчитывается только для питьевой воды/.test(x)));
});
const ch = listChoices(data);
const formPage = async (nuclide) => {
  let raw = S.setField(S.setField(S.initialRaw(ch), ch, 'measuredForm', 'fresh'), ch, 'product', MINERAL);
  raw = S.setNuclideField(raw, 0, 'nuclide', nuclide);
  const html = await renderJsx('src/react/Form.jsx', 'default', { choices: ch, raw, setRaw() {}, tab: 0, setTab() {}, onPreset() {}, onExport() {} });
  return { html, text: flat(html) };
};
test('Замечание 8: у строки Rn-222 нет выбора «Оценка загрязнения места сбора» (коэффициентов перехода для радона нет); у Cs-137 он остаётся', async () => {
  const rn = await formPage('Rn-222');
  assert.doesNotMatch(rn.html, /n-transfer/);
  assert.doesNotMatch(rn.text, /Оценка загрязнения места сбора/);
  const cs = await formPage('Cs-137');
  assert.match(cs.html, /n-transfer/);
  assert.match(cs.text, /Оценка загрязнения места сбора \(Cs-137\)/);
});
test('Замечание 9: VERDICT_MINERAL — у столовой природной минеральной воды в ТР ЕАЭС 044/2017 (стр. 18) собственные уровни для природных нуклидов; показатель B для них не выдаётся', async () => {
  const t = flat(T.VERDICT_MINERAL);
  assert.doesNotMatch(t, /калькулятор их не содержит/);
  assert.match(t, /столовой природной минеральной воды[^.]*стр\. 18/);
  assert.match(t, /собственные уровни вмешательства[^.]*природных радионуклидов/);
  assert.match(t, /радия-226/);
  assert.match(t, /полония-210/);
  assert.match(t, /цезия-137[^.]*стронция-90[^.]*нет/);
  assert.match(t, /показатель B[^.]*не выдаётся/);
  const input = mk('water', MINERAL, [['Ra-226', 0.1], ['Cs-137', 20]]);
  const res = run(input);
  assert.equal(res.limits.compliance, null);
  assert.match(await view(res, input, 'norms'), /собственные уровни вмешательства/);
  assert.match(report(input, res), /собственные уровни вмешательства/);
});
test('Н-2: на узком окне (до 480 px) шкала «Бытовых рисков» уже, чтобы таблица помещалась в 320 px без внутренней прокрутки (было 333 px)', () => {
  const css = src('src/ui/styles.css');
  const m = css.match(/@media \(max-width:\s*480px\)\s*\{\s*\.life-table tbody td\.life-bar\s*\{\s*min-width:\s*([\d.]+)rem/);
  assert.ok(m, 'нет правила для узкого окна');
  assert.ok(Number(m[1]) <= 6, `min-width шкалы ${m[1]}rem`);
});
test('Н-1: в index.html есть <link rel="icon"> на SVG, файл существует и корректен (запрос /favicon.ico не нужен)', () => {
  const m = src('index.html').match(/<link[^>]*rel="icon"[^>]*href="([^"]+)"/);
  assert.ok(m, 'нет <link rel="icon">');
  assert.ok(!m[1].startsWith('/'), 'путь относительный (сайт лежит в подкаталоге /food-radiorisk/)');
  const rel = m[1].replace(/^\.\//, '');
  assert.ok(existsSync(fileURLToPath(new URL(`../${rel}`, import.meta.url))), rel);
  assert.match(src(rel), /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[\s\S]*<\/svg>\s*$/);
});

// ---------- дополнительный пункт оператора: доза и риск радона на «Сводке» (боевой образец — «Вода из скважины», Rn-222 80 Бк/кг) ----------
// независимый пересчёт: питьё 80·365·3,5e-9; вдыхание 80·1000·1e-4·7000·0,4·9e-9; риск = E·0,05 (номинальный коэффициент НРБ-99/2009 п. 2.3, как у остальных нуклидов)
const WELL = 'Вода из скважины';
const wellInput = (extra = []) => mk(null, WELL, [['Rn-222', 80], ...extra], { portionKg: 1, portionsPerYear: 365, years: 50 });
const ING_Y = 80 * 365 * 3.5e-9, INH_Y = 80 * 1000 * 1e-4 * 7000 * 0.4 * 9e-9, K = 0.05;
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9 * b, `${a} против ${b}`);
test('Радон на «Сводке» (расчёт): «Вода из скважины» 80 Бк/кг — доза питья и вдыхания раздельно и суммой, риск за 50 лет тем же коэффициентом 0,05 Зв⁻¹, что у остальных нуклидов', () => {
  const r = run(wellInput()), rn = r.radon;
  near(rn.ingestion.doseSvPerYear, ING_Y); near(rn.inhalation.doseSvPerYear, INH_Y);
  assert.equal(rn.riskCoeff, K);
  near(rn.ingestion.riskTotal, ING_Y * 50 * K); near(rn.inhalation.riskTotal, INH_Y * 50 * K);
  near(rn.sum.doseSvPerYear, ING_Y + INH_Y); near(rn.sum.doseSvTotal, (ING_Y + INH_Y) * 50); near(rn.sum.riskTotal, (ING_Y + INH_Y) * 50 * K);
  assert.equal(r.totals.riskNominal, null, 'в главный итог по искусственным нуклидам радон не входит');
});
test('Радон на «Сводке» (расчёт): минеральная вода — без вдыхания, сумма = питьё; вместе с Cs-137 основной итог не меняется', () => {
  const m = run(mk('water', MINERAL, [['Rn-222', 80]], { portionKg: 1, portionsPerYear: 365, years: 50 })).radon;
  assert.equal(m.inhalation, null);
  assert.equal(m.sum.riskTotal, m.ingestion.riskTotal);
  const cs = run(wellInput([['Cs-137', 5]])), only = run(mk(null, WELL, [['Cs-137', 5]], { portionKg: 1, portionsPerYear: 365, years: 50 }));
  assert.equal(cs.totals.riskNominal, only.totals.riskNominal);
  assert.equal(cs.totals.doseSvTotal, only.totals.doseSvTotal);
});
test('Радон на «Сводке» (экран): блок «Радон-222 в питьевой воде» — годовая доза питья, вдыхания и сумма, риск за 50 лет на 1 000 000, пометка о природном нуклиде и НРБ п. 3.1.3, 5.3.1', async () => {
  for (const extra of [[], [['Cs-137', 5]]]) {
    const input = wellInput(extra), result = run(input);
    const t = await view(result, input, 'sum');
    assert.equal(count(t, /Радон-222 в питьевой воде/g) >= 1, true);
    for (const v of [fmtDose(ING_Y), fmtDose(INH_Y), fmtDose(ING_Y + INH_Y), fmtPerMillion((ING_Y + INH_Y) * 50 * K), fmtPerMillion(ING_Y * 50 * K), fmtPerMillion(INH_Y * 50 * K)]) assert.ok(t.includes(flat(v)), `${v} — нет на «Сводке» (${extra.length ? 'с Cs-137' : 'только радон'})`);
    assert.match(t, /природный радионуклид[^.]*в главный итог по искусственным нуклидам не входит[^.]*НРБ-99\/2009, п\. 3\.1\.3, 5\.3\.1/);
    assert.match(t, /коэффициент[^.]*0,05/);
  }
  assert.equal(count(await view(run(wellInput()), wellInput(), 'sum'), /В продукте рассчитывается только радон-222/g), 1);
});
