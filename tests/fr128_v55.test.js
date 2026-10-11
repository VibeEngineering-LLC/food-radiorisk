// #FR-128 (v55): замечания проверки B к v54 — Б-1 (минеральная вода и нормативы радона), Н-1, Н-2, Н-3, Н-11. Каждый тест красный на 135d335 и зелёный после правки.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { loadJsx } from './render_helper.js';
import { buildReport } from '../src/ui/report.js';

const UNPACKED = 'Питьевая вода неупакованная (из-под крана, колодец, скважина, родник)';
const PACKED = 'Вода питьевая упакованная (бутилированная)';
const MINERAL = 'Вода минеральная';
const CUSTOM = 'моя вода';
const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const WHEN = '2026-10-10T12:00:00.000Z';
const strip = (h) => h.replace(/<[^>]+>/g, ' ');
const flat = (h) => strip(h).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/[\s   ]+/g, ' ').trim();
const water = (name, nuc, over = {}) => inputFor('water', name, nuc, { portionKg: 2, portionsPerYear: 365, region: 'world', ...over });
const run = (input) => { const r = computeScenario(data, input); assert.ok(r.ok, (r.errors || []).join('; ')); return r; };
const report = (format, input, result) => flat(buildReport(format, { input, result }, META, WHEN).text);
let R;
const view = async (result, input, tab) => { R ??= await loadJsx('src/react/Result.jsx', 'default'); return flat(R.render({ result, input, meta: META, initialTab: tab })); };
test.after(async () => { if (R) await R.done(); });
// ---------- Б-1 ----------
test('Б-1: запись словаря «Вода минеральная» несёт признак вида воды, упакованная питьевая — тоже, колодезная — нет', () => {
  const kind = (name) => data.products.find(r => r.name_ru === name)?.water_kind;
  assert.equal(kind(MINERAL), 'mineral');
  assert.equal(kind(PACKED), 'packaged');
  assert.equal(kind(UNPACKED), undefined);
});

test('Б-1: минеральная вода — блок радона без отношений к НРБ/СанПиН/Директиве, доза от питья как у упакованной воды', () => {
  const nuc = [['Rn-222', 100]];
  const m = run(water(MINERAL, nuc)).radon, p = run(water(PACKED, nuc)).radon;
  assert.equal(m.mineral, true);
  assert.equal(p.mineral, false);
  assert.equal(m.norms.ru, null);
  assert.equal(m.norms.sanpin, null);
  assert.equal(m.norms.eu.param, null);
  assert.equal(m.norms.eu.remedial, null);
  assert.equal(m.ingestion.doseSvPerYear, p.ingestion.doseSvPerYear);
  assert.equal(m.inhalation, null);
  assert.ok(p.norms.ru && p.norms.sanpin && p.norms.eu.param, 'для упакованной воды сравнения остаются');
});
test('Б-1: минеральная вода — Rn-222 нет в таблице норм других стран (Директива ст. 3 п. 2(a)); у упакованной есть', () => {
  const nuc = [['Rn-222', 100], ['Cs-137', 5]];
  const rn = (r) => r.limits.foreign.filter(l => l.nuclides.includes('Rn-222'));
  assert.equal(rn(run(water(MINERAL, nuc))).length, 0);
  assert.ok(rn(run(water(PACKED, nuc))).length >= 2);
});

test('Б-1: экран «Соответствие нормам» для минеральной воды — научная фраза со ссылками на пункты, без отношений', async () => {
  const input = water(MINERAL, [['Rn-222', 100]]);
  const t = await view(run(input), input, 'norms');
  assert.match(t, /Радон-222 в питьевой воде/);
  assert.match(t, /Для минеральных и лечебных вод устанавливаются специальные нормативы/);
  assert.match(t, /НРБ-99\/2009, п\. 5\.3\.5/);
  assert.match(t, /Директива[^.]*2013\/51\/Евратом[^.]*ст\. 3, п\. 2\(a\)/);
  assert.doesNotMatch(t, /A\/значение/);
  assert.doesNotMatch(t, /Уровень вмешательства по (НРБ-99\/2009|СанПиН)/);
  assert.doesNotMatch(t, /Параметрическое значение, Европейский союз/);
  assert.doesNotMatch(t, /превышени/);
});
test('Б-1: отчёт для минеральной воды — та же фраза, нет НРБ-УВ 60 Бк/кг и значений Директивы', () => {
  const input = water(MINERAL, [['Rn-222', 100]]);
  const t = report('md', input, run(input));
  assert.match(t, /Для минеральных и лечебных вод устанавливаются специальные нормативы/);
  assert.doesNotMatch(t, /уровень вмешательства 60 Бк\/кг/);
  assert.doesNotMatch(t, /параметрическое значение 100 Бк\/л/);
});

test('Б-1 (контроль): упакованная и неупакованная вода сохраняют сравнение с нормативами', async () => {
  for (const name of [PACKED, UNPACKED]) {
    const input = water(name, [['Rn-222', 100]]);
    const t = await view(run(input), input, 'norms');
    assert.match(t, /A\/значение/, name);
    assert.match(t, /Уровень вмешательства по НРБ-99\/2009, Российская Федерация/, name);
    assert.doesNotMatch(t, /Для минеральных и лечебных вод устанавливаются специальные нормативы/, name);
  }
});
// ---------- Н-1 / Н-2 ----------
test('Н-1: «Сводка» для воды только с Rn-222 — без «нет данных сравнения», с указанием на блок радона', async () => {
  const input = water(UNPACKED, [['Rn-222', 100]]);
  const t = await view(run(input), input, 'sum');
  assert.doesNotMatch(t, /нет данных сравнения/);
  assert.match(t, /Радон-222 в питьевой воде/);
  assert.match(t, /Соответствие нормам/);
});

test('Н-1 (контроль): для воды без радона указание на блок радона не появляется', async () => {
  const input = water(PACKED, [['Cs-137', 5]]);
  assert.doesNotMatch(await view(run(input), input, 'sum'), /Радон-222 в питьевой воде/);
});

test('Н-2: над таблицей норм питьевой воды нет подписи «Группа продукта не выбрана — … прочих пищевых продуктов»', async () => {
  const input = water(UNPACKED, [['Cs-137', 5], ['Rn-222', 20]], { foodGroupCode: null });
  const t = await view(run(input), input, 'norms');
  assert.doesNotMatch(t, /Группа продукта не выбрана/);
  assert.doesNotMatch(t, /Цезий и стронций — категория/);
  assert.match(t, /Нормы других стран/);
});

test('Н-2 (контроль): для неизвестного продукта без группы подпись остаётся', async () => {
  const input = inputFor(null, 'неведомый продукт', [['Cs-137', 5]], { region: 'world' });
  assert.match(await view(run(input), input, 'norms'), /Группа продукта не выбрана/);
});

// ---------- Н-3 ----------
test('Н-3 (v56: заменено решением Н-2): своё название + явная группа норм «Упакованная питьевая вода» — вода упакованная: распад от даты пробы, без вдыхания, без пометки «упаковка не указана»', async () => {
  const input = water(CUSTOM, [['Rn-222', 100]], { eatDate: '2026-10-11' });
  input.nuclides.forEach(n => { n.sampleDate = '2026-09-11'; });
  const result = run(input);
  assert.equal(result.radon.inhalation, null, 'вдыхания нет');
  assert.equal(result.radon.packaging, 'packaged');
  assert.ok(result.rows[0].rawBqPerKg < 1, 'распад от даты пробы применён');
  assert.doesNotMatch(await view(result, input, 'norms'), /Упаковка воды не указана/);
  assert.doesNotMatch(report('md', input, result), /Упаковка воды не указана/);
});

test('Н-3: явные виды воды — без пометки; упакованная и минеральная не получают вдыхание, колодезная получает', async () => {
  const kinds = { [PACKED]: ['packaged', false], [MINERAL]: ['mineral', false], [UNPACKED]: ['unpacked', true] };
  for (const [name, [kind, inh]] of Object.entries(kinds)) {
    const input = water(name, [['Rn-222', 100]]);
    const result = run(input);
    assert.equal(result.radon.packaging, kind, name);
    assert.equal(!!result.radon.inhalation, inh, name);
    assert.doesNotMatch(await view(result, input, 'norms'), /Упаковка воды не указана/, name);
  }
});
test('Н-3: распад других нуклидов в воде без признака упаковки не меняется (только Rn-222 — непрерывный источник)', () => {
  const mk = (name) => { const i = water(name, [['Cs-137', 100]], { eatDate: '2036-10-11' }); i.nuclides.forEach(n => { n.sampleDate = '2026-10-11'; }); return run(i).rows[0].rawBqPerKg; };
  assert.equal(mk(CUSTOM), mk(PACKED));
});

// ---------- Н-11 ----------
test('Н-11: url карточки Rn-222 ведёт на таблицу Rn-222, а не Ra-226', () => {
  assert.equal(data.nuclides.find(r => r.id === 'hl_rn222_ddep').url, 'http://www.lnhb.fr/nuclides/Rn-222_tables.pdf');
});

test('Н-11: цитата ЕС 1(b) дословна; запись ВОЗ называет разд. 9.7.3', () => {
  const eu = data.limits_foreign.find(r => r.id === 'eu_2013_51_rn222_remedial');
  assert.equal(eu.quote, 'Remedial action is deemed to be justified on radiological protection grounds, without further consideration, where radon concentrations exceed 1 000 Bq/l.');
  const who = data.limits_foreign.find(r => r.id === 'who_gdwq2017_rn222_no_guidance');
  assert.match(who.loc, /9\.7\.1/);
  assert.match(who.loc, /9\.7\.3/);
});

