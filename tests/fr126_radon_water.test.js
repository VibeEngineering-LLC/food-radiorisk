// #FR-126 (v52): радон-222 в питьевой воде. Ожидаемые числа посчитаны в тесте независимо от кода (из первоисточников), не взяты из данных проекта.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { decayFactor } from '../src/calc/core.js';
import { renderJsx } from './render_helper.js';

const WATER = 'Питьевая вода неупакованная (из-под крана, колодец, скважина, родник)';
// NRC 1999, Table 4.5b, строка Effective, Зв/Бк (infant = группа «3 месяца» модели)
const NRC = { '3m': 4.0e-8, '1y': 2.3e-8, '5y': 1.0e-8, '10y': 5.9e-9, '15y': 4.2e-9, adult: 3.5e-9 };
const HALF_DAYS = 3.8232; // DDEP, T½ Rn-222
const DAY_MS = 86400000;
const A = 10, VOLUME_KG = 2 * 365; // 10 Бк/кг; 2 кг в день, 730 кг в год (НРБ-99/2009 п. 8: Мнас = 730 кг)
const close = (a, b, rel = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg} получено ${a}, ожидалось ${b}`);
const water = (nuc, over = {}) => inputFor('water', WATER, nuc, { portionKg: 2, portionsPerYear: 365, ...over });
const run = (nuc, over) => computeScenario(data, water(nuc, over));
const flat = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/[\s  ]+/g, ' ').trim();
const sources = JSON.parse(readFileSync(new URL('../public/data/sources.json', import.meta.url), 'utf8')).sources;

test('FR-126: данные — Rn-222 с T½ 3,8232 сут (DDEP), шесть возрастных коэффициентов NRC 1999, у каждого числа источник из реестра', () => {
  const hl = data.nuclides.filter(r => r.nuclide === 'Rn-222');
  assert.equal(hl.filter(r => r.recommended).length, 1);
  assert.equal(hl.find(r => r.recommended).half_life_days, HALF_DAYS);
  for (const [age, v] of Object.entries(NRC)) {
    const rec = data.dose_coeff.filter(r => r.nuclide === 'Rn-222' && r.age === age);
    assert.equal(rec.length, 1, age);
    assert.equal(rec[0].value, v, age);
    assert.equal(rec[0].source, 'NRC1999');
  }
  const newRisk = data.risk.filter(r => /^(unscear2000_rnw_|who_gdwq2017_rnw_|nrb2009_p535_|sanpin1_2_3685_21_)/.test(r.id));
  assert.ok(newRisk.length >= 7);
  for (const r of [...newRisk, ...data.dose_coeff.filter(r => r.nuclide === 'Rn-222')]) assert.ok(sources[r.source]?.title_ru, `${r.id}: источника ${r.source} нет в sources.json`);
  for (const id of ['NRC1999', 'EU_DIR_2013_51', 'WHO_GDWQ2017']) assert.ok(sources[id], id);
  assert.equal(sources.NRC1999.doi, '10.17226/6287');
  assert.equal(Object.keys(sources).filter(k => /^UNSCEAR2000/.test(k)).length, 1, 'дубль источника НКДАР 2000');
  const uv = (id) => data.risk.find(r => r.id === id).value;
  assert.equal(uv('nrb2009_p535_rn222_water_uv'), 60);
  assert.equal(uv('sanpin1_2_3685_21_t312_rn222_uv'), 60);
});

// даты в форме — только ГГГГ-ММ-ДД (целые сутки): от пробы 2026-01-01 до потребления через d суток
const PACKED = 'Вода питьевая упакованная (бутилированная)';
const withDates = (nuc, days, name = PACKED) => { const inp = water(nuc, { eatDate: new Date(Date.UTC(2026, 0, 1 + days)).toISOString().slice(0, 10), product: { name, state: 'fresh' } }); inp.nuclides[0].sampleDate = '2026-01-01'; return inp; };
// v53 (оператор: «Неупакованная — без распада»): неупакованная вода (кран, колодец) — источник непрерывный, активность как измерена; упакованная — распад от даты пробы
test('FR-126 v53: неупакованная вода — без пересчёта распадом (доза при питье и вдыхание от одной активности); упакованная — 2^(−30/3,8232)', () => {
  const un = computeScenario(data, withDates([['Rn-222', 100]], 30, WATER)), pk = computeScenario(data, withDates([['Rn-222', 100]], 30));
  close(un.rows[0].rawBqPerKg, 100, 1e-12, 'неупакованная');
  close(un.radon.inhalation.doseSvPerYear, 100 * 1000 * 1e-4 * 7000 * 0.4 * 9e-9, 1e-12, 'вдыхание, неупакованная');
  close(un.rows[0].doseSvPerYear, 100 * 730 * 3.5e-9, 1e-12, 'питьё, неупакованная');
  const f = Math.pow(2, -30 / HALF_DAYS);
  close(pk.rows[0].rawBqPerKg, 100 * f, 1e-9, 'упакованная');
  close(pk.radon.inhalation.doseSvPerYear, 100 * f * 1000 * 1e-4 * 7000 * 0.4 * 9e-9, 1e-9, 'вдыхание, упакованная');
  assert.ok(un.rows[0].provenance.some(p => /не применён/.test(p.note || '')), 'в провенансе пометка, что распад не применён');
});
test('FR-126: распад Rn-222 от даты пробы до даты потребления — за 3,8232 сут вдвое (T½ из данных), на целых сутках A·2^(−d/3,8232)', () => {
  const rec = data.nuclides.find(r => r.nuclide === 'Rn-222' && r.recommended);
  close(decayFactor(rec.half_life_days, HALF_DAYS), 0.5, 1e-12, 'за T½ ровно вдвое');
  close(decayFactor(rec.half_life_days, 2 * HALF_DAYS), 0.25, 1e-12, 'за 2·T½ вчетверо');
  for (const d of [4, 8, 30]) {
    const r = computeScenario(data, withDates([['Rn-222', 100]], d));
    assert.ok(r.ok, r.errors?.join('; '));
    close(r.rows[0].rawBqPerKg, 100 * Math.pow(2, -d / HALF_DAYS), 1e-9, `d=${d}`);
    // ингаляционная строка считается по активности воды на дату потребления (после распада)
    close(r.radon.inhalation.doseSvPerYear, 100 * Math.pow(2, -d / HALF_DAYS) * 1000 * 1e-4 * 7000 * 0.4 * 9e-9, 1e-9, `ингаляция, d=${d}`);
  }
});

test('FR-126: доза при питье = A·V·e(g) по возрасту (NRC 1999), коэффициент берётся при любом выбранном источнике e(g); по годам не распадается', () => {
  for (const doseSource of ['ICRP119_F1', 'NRB2009_App2']) {
    const r = run([['Rn-222', A]], { age: 'adult', doseSource });
    assert.ok(r.ok, r.errors?.join('; '));
    close(r.rows[0].doseSvPerYear, A * VOLUME_KG * 3.5e-9, 1e-12, doseSource);
    close(r.rows[0].eSvPerBq, 3.5e-9, 1e-12);
  }
  for (const age of ['3m', '1y', '5y', '10y', '15y']) close(run([['Rn-222', A]], { age }).rows[0].doseSvPerYear, A * VOLUME_KG * NRC[age], 1e-12, age);
  // радон поступает из воды непрерывно: многолетний срок без распада по годам (у Cs-137 распад по годам есть)
  const r3 = run([['Rn-222', A]], { years: 3 });
  close(r3.rows[0].doseSvTotal, 3 * A * VOLUME_KG * 3.5e-9, 1e-12, '3 года');
});

test('FR-126: ингаляция выделившегося радона — ОТДЕЛЬНАЯ строка (НКДАР 2000 пп. 114–115, 157), с питьём не складывается', () => {
  const r = run([['Rn-222', A]], { years: 3 });
  const inhal = A * 1000 * 1e-4 * 7000 * 0.4 * 9e-9; // 10 Бк/л -> 10 000 Бк/м3 -> 1 Бк/м3 в воздухе; 2,52e-5 Зв/год = 0,025 мЗв (НКДАР п. 157)
  close(inhal, 2.52e-5, 1e-12);
  assert.ok(r.radon, 'result.radon');
  close(r.radon.inhalation.doseSvPerYear, inhal, 1e-12);
  close(r.radon.inhalation.doseSvTotal, 3 * inhal, 1e-12);
  close(r.radon.ingestion.doseSvPerYear, A * VOLUME_KG * 3.5e-9, 1e-12);
  close(r.totals.doseSvPerYear, A * VOLUME_KG * 3.5e-9, 1e-12, 'в сумме доз только питьё');
  assert.ok(Math.abs(r.totals.doseSvPerYear - (A * VOLUME_KG * 3.5e-9 + inhal)) > 1e-7, 'ингаляция не добавлена к дозе при питье');
  // активность в воде берётся на дату потребления (после распада)
  assert.equal(computeScenario(data, water([['Cs-137', 5]])).radon, null);
});

test('FR-126: Rn-222 — природный: в главный риск (техногенные нуклиды) не входит, показан отдельно', () => {
  const only = run([['Rn-222', A]]);
  assert.equal(only.rows[0].natural, true);
  assert.equal(only.totals.riskNominal, null);
  assert.deepEqual(only.totals.techNuclides, []);
  assert.deepEqual(only.totals.naturalNuclides, ['Rn-222']);
  assert.equal(only.rows[0].pgpBqPerYear, null);
  const cs = run([['Cs-137', 5]]), both = run([['Cs-137', 5], ['Rn-222', A]]);
  close(both.totals.riskNominal, cs.totals.riskNominal, 1e-12, 'главное число = только Cs-137');
  close(both.totals.techDoseSvTotal, cs.totals.techDoseSvTotal, 1e-12);
  assert.deepEqual(both.totals.naturalNuclides, ['Rn-222']);
});

test('FR-126: нормативы — НРБ-99/2009 п. 5.3.5 60 Бк/кг, ЕС 2013/51 100 Бк/л (100–1000; выше 1000 меры обязательны), ВОЗ — числа нет', () => {
  const r = run([['Rn-222', 30]]);
  const n = r.radon.norms;
  assert.equal(n.ru.uv, 60); close(n.ru.ratio, 30 / 60, 1e-12);
  assert.equal(n.sanpin.uv, 60);
  assert.equal(n.eu.param.value, 100); close(n.eu.param.ratio, 0.3, 1e-12);
  assert.equal(n.eu.remedial.value, 1000); close(n.eu.remedial.ratio, 0.03, 1e-12);
  assert.equal(n.who.value, null);
  assert.ok(r.limits.intervention.find(x => x.nuclide === 'Rn-222').uv === 60, 'таблица уровней вмешательства');
  const who = data.limits_foreign.filter(f => f.jurisdiction === 'WHO');
  assert.ok(who.length >= 1 && who.every(f => f.value === null && f.nuclides.length === 0), 'у ВОЗ в данных нет числа для радона');
  assert.ok(!data.limits_foreign.some(f => /WHO|ВОЗ/.test(f.document) && /radon|радон/i.test(f.document + f.quote) && Number.isFinite(f.value)), 'числа «ВОЗ — радон» нет ни в одной записи');
});

test('FR-126: экран и отчёт — отдельная строка «Вдыхание», оговорка про кипячение и отстаивание, у ВОЗ нет «100 Бк/л»', async () => {
  const input = water([['Rn-222', 30]]), result = computeScenario(data, input);
  const meta = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
  const norms = flat(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta, initialTab: 'norms' }));
  assert.match(norms, /Радон-222 в питьевой воде/);
  assert.match(norms, /Вдыхание радона, выделившегося из воды/);
  assert.match(norms, /Кипячение полностью удаляет радон/);
  assert.match(norms, /отстаивание снижает/);
  assert.match(norms, /не складывается/);
  assert.match(norms, /60 Бк\/кг/);
  assert.match(norms, /100 Бк\/л/);
  assert.ok(!/ВОЗ[^.]{0,60}100\s*Бк\/л/.test(norms), 'ВОЗ не должна получить число');
  assert.match(norms, /ВОЗ[^.]{0,120}(не устанавливает|нет)/);
  const sum = flat(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta, initialTab: 'sum' }));
  assert.ok(!/смерт[ьи] от рака/.test(sum) || /природн/.test(sum), 'в Сводке радон отмечен как природный');
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(norms), 'эмодзи в тексте');
});

test('FR-126: Rn-222 для продукта, не являющегося водой, — предупреждение (радон нормируется только в воде)', () => {
  const r = computeScenario(data, inputFor('milk', 'молоко', [['Rn-222', A]], { portionKg: 0.5, portionsPerYear: 365 }));
  assert.ok(r.warnings.some(w => /Радон-222.*питьев/.test(w)), r.warnings.join(' | '));
  assert.equal(r.radon, null);
  assert.ok(!run([['Rn-222', A]]).warnings.some(w => /только для питьевой воды/.test(w)));
});
