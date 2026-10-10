// #FR-81 V08: вкладка «Бытовые риски за {срок}» — вероятность умереть от причины за те же N лет начиная с возраста a (src/calc/life_risks.js + LifeRisks.jsx); эталоны — независимый пересчёт tools/risks_lifetime_ref.py по таблицам Росстата и ВОЗ (#SA-10); без «во сколько раз» и «1 из»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const S2 = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const CAP = () => ({ ...S1(), years: 70 });
const draw = async (input) => { const result = computeScenario(data, input); const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'life' }); return { result, text: norm(html) }; };
const CODES = ['1026', '1096', '1097', '1098', '1099', '1100'];
const LABELS = ['Умереть от новообразований (рака и других опухолей, C00–D48)', 'Умереть в дорожно-транспортном происшествии', 'Умереть от падения', 'Утонуть', 'Умереть от огня (пожара)', 'Умереть от случайного отравления'];
const pick = (life) => life.rows.filter(r => r.kind === 'cause').map(r => r.p);

const REF = {
  s1: [0.000627723726052783, 0.0017612859425228816, 0.00019848963088160365, 0.0002241916128164166, 6.856409838565245e-05, 0.0005635684115079841],
  s2: [0.0002564668402614273, 0.00019131433868480808, 3.710919696067946e-05, 0.00014825973044624093, 3.428151322570945e-05, 7.058001719181066e-05],
  cap: [0.13965222261229535, 0.007732807011640446, 0.0031404095603592545, 0.001645285599775678, 0.0014076776780279176, 0.008199177103231899]
};
const close = (got, exp, msg) => assert.ok(got.length === exp.length && got.every((v, i) => Math.abs(v - exp[i]) < 1e-9), msg);

test('V08: значения — S1 (20→30), S2 (3→13), срок за 85 лет обрезан', async () => {
  // (1) S1
  const a = await draw(S1());
  const life = a.result.lifeRisks;
  assert.equal(life.a, 20, '(1) life.a');
  assert.equal(life.b, 30, '(1) life.b');
  assert.equal(life.N, 10, '(1) life.N');
  assert.equal(life.n, 10, '(1) life.n');
  assert.equal(life.capped, false, '(1) life.capped');
  assert.equal(life.year, 2019, '(1) life.year');
  assert.deepEqual(life.rows.map(r => r.id), ['product', 'cs_1026', 'cs_1096', 'cs_1097', 'cs_1098', 'cs_1099', 'cs_1100'], '(1) ids');
  close(pick(life), REF.s1, '(1) values');
  assert.deepEqual(life.rows.slice(1).map(r => r.label), LABELS, '(1) labels');
  assert.ok(a.text.includes('За 10 лет, на 1 000 000'), '(1) header');
  assert.ok(a.text.includes('Умереть в дорожно-транспортном происшествии 1800'), '(1) road text');
  assert.ok(a.text.includes('Умереть от новообразований (рака и других опухолей, C00–D48) 630'), '(1) cancer text');
  assert.ok(a.text.includes('Утонуть 220'), '(1) drown text');
  assert.ok(a.text.includes('Умереть от огня (пожара) 69'), '(1) fire text');
  assert.ok(a.text.includes('Умереть от случайного отравления 560'), '(1) poison text');
  assert.ok(a.text.includes('Умереть от падения 200'), '(1) fall text');
  assert.ok(a.text.includes('за те же 10 лет, что длится питание, начиная с 20 лет, на 1 000 000 человек'), '(1) caption');

  // (2) S2
  const b = await draw(S2());
  assert.equal(b.result.lifeRisks.a, 3, '(2) life.a');
  assert.equal(b.result.lifeRisks.b, 13, '(2) life.b');
  close(pick(b.result.lifeRisks), REF.s2, '(2) values');
  assert.ok(b.text.includes('начиная с 3 лет'), '(2) caption');
  assert.ok(b.text.includes('Утонуть 150'), '(2) drown text');
  assert.ok(b.text.includes('Умереть в дорожно-транспортном происшествии 190'), '(2) road text');

  // (3) срок за 85 лет
  const c = await draw(CAP());
  const lifeC = c.result.lifeRisks;
  assert.equal(lifeC.a, 20, '(3) life.a');
  assert.equal(lifeC.b, 85, '(3) life.b');
  assert.equal(lifeC.N, 70, '(3) life.N');
  assert.equal(lifeC.n, 65, '(3) life.n');
  assert.equal(lifeC.capped, true, '(3) life.capped');
  close(pick(lifeC), REF.cap, '(3) values');
  assert.ok(c.text.includes('До 85 лет (за 65 лет), на 1 000 000'), '(3) header');
  assert.ok(c.text.includes('таблица дожития определена до 85 лет'), '(3) cap note');
  assert.ok(c.text.includes('Умереть от новообразований (рака и других опухолей, C00–D48) 140 000'), '(3) cancer text');
});

test('V08: тексты вкладки и запрещённые слова', async () => {
  const { text } = await draw(S1());
  assert.ok(text.includes('Гибель в дорожном происшествии или при пожаре наступает сразу.'), 'text: immediate death');
  assert.ok(text.includes('лейкоз — через 2 года, другие виды рака — через 10 лет и позже'), 'text: latency');
  assert.ok(text.includes('Эти сравнения показывают масштаб чисел, а не то, какой риск считать приемлемым.'), 'text: disclaimer');
  assert.ok(text.includes('Россия, 2019 г. — последний год до пандемии; оба пола вместе'), 'text: source year');
  assert.ok(text.includes('линейная интерполяция'), 'text: interpolation');
  assert.ok(text.includes('Для взрослого принят возраст 20 лет.'), 'text: adult age');
  assert.ok(text.includes('Источники: Росстат, Демографический ежегодник России 2023, табл. 5.3; ВОЗ, база данных смертности (Mortality Database), Россия, 2019 г.'), 'text: sources');
  assert.ok(text.includes('Шкала (логарифмическая)'), 'text: scale');
  assert.ok(text.includes('Причина смерти'), 'text: cause header');

  assert.ok(!/во сколько раз/i.test(text), 'forbidden: во сколько раз');
  assert.ok(!/1 из /.test(text), 'forbidden: 1 из');
  assert.ok(!/EPA/.test(text), 'forbidden: EPA');
  assert.ok(!/заболе/i.test(text), 'forbidden: заболе');
  assert.ok(!/ущерб/i.test(text), 'forbidden: ущерб');

  const s2Text = (await draw(S2())).text;
  assert.ok(!s2Text.includes('Для взрослого принят возраст 20 лет.'), 'S2: no adult age note');
});

test('V08: вкладки нет, когда сравнивать не с чем', () => {
  assert.equal(computeScenario(data, inputFor(null, 'вода', [['Ra-226', 1]], {})).lifeRisks, null, 'natural nuclide');
  assert.equal(computeScenario(data, { ...S2(), lifetime: { fromAge: 85, toAge: 95 }, years: 10 }).lifeRisks, null, 'age >= 85');
  const noTable = computeScenario({ ...data, life_risks: data.life_risks.filter(r => r.kind !== 'life_table') }, S1());
  assert.equal(noTable.lifeRisks, null, 'no life table');
  assert.equal(noTable.ok, true, 'no life table but ok');
});

test('V08: подпись вкладки повторяет срок питания; возраст — в родительном падеже', async () => {
  const shown = async (input) => { const result = computeScenario(data, input); return norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'life' })); };
  const t2 = await shown(S2());
  assert.ok(t2.includes('Бытовые риски за 3–13 лет'), 'S2: подпись вкладки');
  const t1y = await shown(inputFor('milk', 'молоко', [['Cs-137', 100]], { age: '1y', portionKg: 0.3, portionsPerYear: 365, years: 1 }));
  assert.ok(t1y.includes('начиная с 1 года,'), '1 год: вкладка');
  assert.ok(t1y.includes('в возрасте 1 года от новообразований'), '1 год: строка фона на главном экране');
});
