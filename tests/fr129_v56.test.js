// #FR-129 (v56): замечания независимой проверки v55 (проход B) — Б-1 (минеральная вода и ТР ЕАЭС 044/2017 табл. 4), Б-2 (радон-222: проба позже начала потребления),
// Н-1 (дубль абзаца на «Сводке»), Н-2 (группа норм «упакованная» → вода упакованная; сообщение при «вода» + группа рациона), английские слова и «копии» в данных.
// Каждый тест красный на ddde53e и зелёный после правки; боевые образцы — сценарии S3, S7, S4a/S4b проверки.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { loadJsx } from './render_helper.js';
import { buildReport } from '../src/ui/report.js';
import { locRu } from '../src/ui/ru.js';

const UNPACKED = 'Питьевая вода неупакованная (из-под крана, колодец, скважина, родник)';
const PACKED = 'Вода питьевая упакованная (бутилированная)';
const MINERAL = 'Вода минеральная';
const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const WHEN = '2026-10-11T12:00:00.000Z';
const strip = (h) => h.replace(/<[^>]+>/g, ' ');
const flat = (h) => strip(h).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/[\s   ]+/g, ' ').trim();
const water = (name, nuc, over = {}) => inputFor(name === UNPACKED ? null : 'water', name, nuc, { portionKg: 1, portionsPerYear: 336, region: 'world', eatDate: '2026-10-11', ...over });
const sampled = (input, date) => { input.nuclides.forEach(n => { n.sampleDate = date; }); return input; };
const run = (input) => { const r = computeScenario(data, input); assert.ok(r.ok, (r.errors || []).join('; ')); return r; };
const report = (input, result) => flat(buildReport('md', { input, result }, META, WHEN).text);
const NO_BACK = /Радон-222: дата пробы позже даты начала потребления[^.]*не пересчитана назад/;
const MINERAL_NORM = /Для столовой природной минеральной воды ТР ЕАЭС 044\/2017[\s\S]*собственные уровни вмешательства[\s\S]*оценка по таблице 4[^.]*не проводится/; // v57 (замечание 9): формулировка уточнена
const rawOf = (r, n) => r.rows.find(x => x.nuclide === n).rawBqPerKg;
let R;
const view = async (result, input, tab) => { R ??= await loadJsx('src/react/Result.jsx', 'default'); return flat(R.render({ result, input, meta: META, initialTab: tab })); };
test.after(async () => { if (R) await R.done(); });
// ---------- Б-2: проба позже начала потребления ----------
test('Б-2 (S7): упакованная вода, Rn-222 10 Бк/кг, проба на 30 сут позже начала — активность не пересчитывается назад выше измеренной', () => {
  const input = sampled(water(PACKED, [['Rn-222', 10]]), '2026-11-10');
  const r = run(input);
  assert.equal(r.rows[0].rawBqPerKg, 10);
  assert.equal(r.radon.activityBqPerKg, 10);
  assert.equal(r.radon.noBackExtrapolation, true);
  const plain = run(water(PACKED, [['Rn-222', 10]]));
  assert.equal(r.radon.ingestion.doseSvPerYear, plain.radon.ingestion.doseSvPerYear);
  assert.ok(r.rows[0].provenance.some(p => p.step === 'распад' && NO_BACK.test(p.note || '')), 'в провенансе — пометка с причиной');
});

test('Б-2: минеральная вода — то же поведение (проба на 30 сут позже начала)', () => {
  const r = run(sampled(water(MINERAL, [['Rn-222', 10]]), '2026-11-10'));
  assert.equal(r.rows[0].rawBqPerKg, 10);
  assert.equal(r.radon.noBackExtrapolation, true);
});
test('Б-2 (S7): экран и отчёт — безличная пометка с причиной; нет «2 300 Бк/кг» и превышения уровня ЕС', async () => {
  const input = sampled(water(PACKED, [['Rn-222', 10]]), '2026-11-10');
  const result = run(input);
  const t = await view(result, input, 'norms');
  assert.match(t, NO_BACK);
  assert.match(t, /[Дд]ата розлива[^.]*неизвестна/);
  assert.doesNotMatch(t, /2 300|2300/);
  assert.doesNotMatch(t, /38,4|2,71/, 'ни A/УВ 38,4, ни дозы 2,71 мЗв из S7');
  assert.doesNotMatch(t, /пересчитана назад к началу потребления/, 'общее предупреждение про пересчёт назад здесь неверно');
  assert.match(report(input, result), NO_BACK);
});

test('Б-2: общее предупреждение «пересчитана назад» не выводится, если назад пересчитывать было нечего (только Rn-222); для Cs-137 — остаётся и пересчёт идёт', () => {
  const only = run(sampled(water(PACKED, [['Rn-222', 10]]), '2026-11-10'));
  assert.ok(!only.warnings.some(w => /пересчитана назад/.test(w)), only.warnings.join(' | '));
  const both = run(sampled(water(PACKED, [['Rn-222', 10], ['Cs-137', 10]]), '2026-11-10'));
  assert.ok(both.warnings.some(w => /пересчитана назад/.test(w)));
  assert.equal(rawOf(both, 'Rn-222'), 10);
  assert.ok(rawOf(both, 'Cs-137') > 10, 'Cs-137 пересчитан назад как прежде');
});
// ---------- Б-1: минеральная вода и ТР ЕАЭС 044/2017 табл. 4 ----------
test('Б-1 (S3): «Вода минеральная» + Cs-137/Sr-90 — показатель B и «не соответствует» по табл. 4 не выдаются, доза считается', async () => {
  const nuc = [['Cs-137', 20], ['Sr-90', 5], ['Rn-222', 100]];
  const input = water(MINERAL, nuc);
  const r = run(input);
  assert.equal(r.limits.compliance, null);
  assert.equal(r.limits.ru.length, 0);
  assert.equal(r.limits.mineralNorms, true);
  const pk = run(water(PACKED, nuc));
  assert.equal(pk.limits.compliance.verdict, 'nonconforms', 'для упакованной воды сравнение остаётся');
  assert.equal(pk.limits.mineralNorms, false);
  const dose = (x, n) => x.rows.find(q => q.nuclide === n).doseSvPerYear;
  assert.equal(dose(r, 'Cs-137'), dose(pk, 'Cs-137'));
  assert.equal(dose(r, 'Sr-90'), dose(pk, 'Sr-90'));
  const t = await view(r, input, 'norms');
  assert.match(t, MINERAL_NORM);
  assert.doesNotMatch(t, /не соответствует/);
  assert.doesNotMatch(t, /Показатель B/);
});
test('Б-2 (контроль): проба раньше начала — распад вперёд по T½ 3,8232 сут, пометки нет', async () => {
  const input = sampled(water(PACKED, [['Rn-222', 100]]), '2026-10-01');
  const r = run(input);
  assert.ok(Math.abs(r.rows[0].rawBqPerKg - 100 * Math.pow(2, -10 / 3.8232)) < 1e-9);
  assert.ok(!r.radon.noBackExtrapolation);
  assert.doesNotMatch(await view(r, input, 'norms'), NO_BACK);
});

test('Б-2 (контроль): неупакованная вода — как прежде, активность принята как измерена', () => {
  const r = run(sampled(water(UNPACKED, [['Rn-222', 10]]), '2026-11-10'));
  assert.equal(r.rows[0].rawBqPerKg, 10);
  assert.ok(!r.radon.noBackExtrapolation);
});
test('Б-2 (симметричный случай): проба намного раньше начала — расчёт выполнен, предупреждение о почти нулевой активности; на 10 и 26 сут — без него', () => {
  const warn = (date) => run(sampled(water(MINERAL, [['Rn-222', 100]]), date)).warnings.find(w => /радон-222/i.test(w) && /периодов полураспада/.test(w));
  const w400 = warn('2025-09-06');
  assert.ok(w400, 'на 400 сут предупреждение есть');
  assert.match(w400, /400\s+сут/);
  assert.ok(warn('2026-08-12'), 'на 60 сут предупреждение есть');
  assert.equal(warn('2026-10-01'), undefined);
  assert.equal(warn('2026-09-15'), undefined, 'на 26 сут (менее 10 периодов) без предупреждения');
});
test('Б-1 (S3): сводка, строка состояния и отчёт — без «не соответствует»; пояснение о нормах минеральной воды есть', async () => {
  const input = water(MINERAL, [['Cs-137', 20]]);
  const result = run(input);
  assert.doesNotMatch(await view(result, input, 'sum'), /не соответствует/);
  const rep = report(input, result);
  assert.match(rep, MINERAL_NORM);
  assert.doesNotMatch(rep, /не соответствует|Показатель B/);
  const { statusText } = await import('../src/ui/status.js');
  assert.doesNotMatch(statusText({ result, input }), /не соответствует/);
});
test('Б-1 (контроль): упакованная вода сохраняет показатель B и заключение; неупакованная — уровни вмешательства', async () => {
  const input = water(PACKED, [['Cs-137', 20]]);
  const t = await view(run(input), input, 'norms');
  assert.match(t, /не соответствует/);
  assert.doesNotMatch(t, MINERAL_NORM);
  assert.ok(run(water(UNPACKED, [['Cs-137', 20]], { foodGroupCode: null })).limits.intervention);
});

test('Б-1: других норм РФ для группы «вода» в данных, кроме ТР ЕАЭС 044 табл. 4, нет (обоснование в отчёте)', () => {
  const ids = data.limits_ru.filter(x => x.food_group_code === 'water' && Number.isFinite(x.value)).map(x => x.id);
  assert.ok(ids.length > 0 && ids.every(id => id.startsWith('t044_')), ids.join(', '));
});

// ---------- Н-1: дубль абзаца на «Сводке» ----------
test('Н-1: абзац «В продукте рассчитывается только радон-222…» на «Сводке» выводится один раз', async () => {
  const input = water(UNPACKED, [['Rn-222', 100]], { foodGroupCode: null });
  const t = await view(run(input), input, 'sum');
  assert.equal((t.match(/В продукте рассчитывается только радон-222/g) || []).length, 1);
});
// ---------- Н-2: упаковка воды по группе норм; сообщение при «вода» + группа рациона ----------
test('Н-2 (S4b): своё название + группа норм «упакованная питьевая вода» — вода упакованная и для радона: распад от даты пробы, без вдыхания, без «упаковка не указана»', async () => {
  const input = sampled(water('моя вода', [['Rn-222', 100], ['Sr-90', 10]]), '2026-10-01');
  const r = run(input);
  assert.equal(r.radon.packaging, 'packaged');
  assert.equal(r.radon.inhalation, null);
  assert.ok(Math.abs(rawOf(r, 'Rn-222') - 100 * Math.pow(2, -10 / 3.8232)) < 1e-9);
  const t = await view(r, input, 'norms');
  assert.doesNotMatch(t, /Упаковка воды не указана/);
  assert.doesNotMatch(t, /неупакованная вода .{0,40}непрерывного источника/);
});

test('Н-2 (контроль; v57: явная группа «упакованная» для неупакованной воды — см. fr130_v57): неупакованная вода без выбранной группы норм — неупакованная; «упакованная» из словаря — как раньше', () => {
  assert.equal(run(water(UNPACKED, [['Rn-222', 100]])).radon.packaging, 'unpacked');
  assert.equal(run(water(PACKED, [['Rn-222', 100]])).radon.packaging, 'packaged');
});
const dietWater = (nuc) => { const i = inputFor(null, 'моя вода', nuc, { portionKg: 1, portionsPerYear: 336, region: 'world' }); i.product.dietGroup = 'water'; return i; };
test('Н-2 (S4a): своё название + группа рациона «питьевая вода» без группы норм — сообщение называет причину и что сделать, не утверждает «только для питьевой воды»', () => {
  const r = computeScenario(data, dietWater([['Rn-222', 50], ['Sr-90', 10]]));
  assert.ok(r.ok, (r.errors || []).join('; '));
  assert.ok(!r.rows.some(x => x.nuclide === 'Rn-222'), 'доза радона не считается, как принято');
  const w = r.warnings.find(x => /Радон-222/.test(x));
  assert.ok(w, r.warnings.join(' | '));
  assert.doesNotMatch(w, /только для питьевой воды/);
  assert.match(w, /«моя вода»[^.]*не найдено в словаре/);
  assert.match(w, /группа рациона «питьевая вода»[^.]*не показывает[^.]*упакован/);
  assert.match(w, /выберите[^.]*в списке продуктов[^.]*или группу норм/);
});

test('Н-2: тот же текст в ошибке, если радон — единственный нуклид; для молока прежнее сообщение', () => {
  const r = computeScenario(data, dietWater([['Rn-222', 50]]));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /не найдено в словаре/);
  const milk = computeScenario(data, inputFor('milk', 'молоко', [['Cs-137', 5], ['Rn-222', 50]], { portionKg: 0.5, portionsPerYear: 365 }));
  assert.ok(milk.warnings.some(x => /Радон-222 рассчитывается только для питьевой воды/.test(x)));
});
// ---------- Английские слова, опечатка и «копии» в данных ----------
test('Данные: в колонке «Условия» норм других стран нет слов food, minor food, feed, Annex, Vaccinium, 1998 doc, Cesium и «—по» без пробела', () => {
  const bad = [];
  const rxs = [/\bminor food\b/, /\bfood\b/, /\bfeed\b/, /\bAnnex\b/, /\bVaccinium\b/, /\b1998 doc\b/, /\bCesium\b/, /Ирландии —по/];
  for (const r of data.limits_foreign) {
    const shown = `${r.sum_rule || ''} | ${locRu(r.loc)}`;
    for (const rx of rxs) if (rx.test(shown)) bad.push(`${r.id}: ${rx}`);
  }
  assert.deepEqual(bad, []);
});

test('Данные: в ссылках на ТР ЕАЭС 044 и ТР ТС 015 нет служебного слова «копии»', () => {
  const bad = data.limits_ru.filter(r => /^t0(44|15)_/.test(r.id) && /копи/.test(locRu(r.loc))).map(r => r.id);
  assert.deepEqual(bad, []);
});

// ---------- v56 (оператор): кнопки примеров — на вкладку 1, под «Подготовку пробы» ----------
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');
test('Примеры: кнопки лежат на вкладке 1 после блока «Подготовка пробы», в строке состояния их нет', () => {
  const form = src('src/react/Form.jsx'), app = src('src/react/App.jsx');
  const prep = form.indexOf('id="prepBox"'), btn1 = form.indexOf('id="preset"'), btn2 = form.indexOf('id="presetBilberry"');
  assert.ok(prep > 0 && btn1 > prep && btn2 > prep, 'кнопки после prepBox');
  assert.ok(form.indexOf('</details>', prep) < btn1, 'кнопки после закрытия блока подготовки пробы');
  assert.ok(form.indexOf('<div {...page(1)}>') > btn2, 'кнопки внутри страницы 0 (вкладка «1 · Продукт и проба»)');
  assert.doesNotMatch(app, /id="preset/);
  assert.doesNotMatch(app, /Пример: /);
  assert.match(app, /id="exportJson"[^\n]*Сохранить отчёт/);
});

test('Вёрстка: заголовок числового столбца «Бытовых рисков» переносится в своей ячейке (на 620 px текст шире ячейки налезал на «Шкала»)', () => {
  const css = src('src/ui/styles.css') + src('src/ui/charts.css');
  const rule = css.split('\n').find(l => /^\.life-table thead th\.num\s*\{/.test(l));
  assert.ok(rule, 'правило .life-table thead th.num');
  assert.match(rule, /white-space:\s*normal/);
  assert.match(rule, /max-width:\s*10rem/);
});
