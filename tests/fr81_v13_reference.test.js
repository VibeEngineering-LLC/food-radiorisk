// #FR-81 V13: вкладки «Подробно (для специалиста)» и «Расчёт и источники»; состав вкладок результата (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { T } from '../src/ui/texts_v.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const S2 = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const NAT = () => inputFor('milk', 'молоко', [['Cs-137', 100], ['Ra-226', 50]], { portionKg: 1, portionsPerYear: 10, years: 1 });
const ref = async (input) => { const result = computeScenario(data, input); return norm(await renderJsx('src/react/Reference.jsx', 'default', { result, input })); };
const screenOf = async (input, initialTab) => { const result = computeScenario(data, input); return norm(await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab })); };

test('V13: S1 — вкладка «Подробно»: ущерб 5,7 и 5,5, коэффициент, уровни НРБ п. 2.3', async () => {
  const t = await ref(S1());
  assert.ok(t.includes(T.REF_COEFF));
  assert.ok(t.includes('(5,7·10⁻² на 1 Зв, НРБ-99/2009 п. 2.3; МКРЗ 103 табл. 1): 19 на 1 000 000'));
  assert.ok(t.includes('Только рак (5,5·10⁻²): 18 на 1 000 000'));
  assert.ok(t.includes('(0,05 × 33 мкЗв): 1,6 на 1 000 000'));
  assert.ok(t.includes('Наибольшая средняя доза за 5 лет подряд: 33 мкЗв'));
  assert.ok(t.includes('Допущение: в годы до и после срока питания доза от продукта равна нулю'));
});

test('V13: модель EPA — строка согласия двух моделей; в режиме «с a до b» её нет', async () => {
  const t1 = await ref(S1());
  assert.ok(t1.includes('Это проверка согласия двух моделей, а не независимая оценка'));
  const t2 = await ref(S2());
  assert.ok(t2.includes(T.REF_EPA_LIFETIME));
  assert.ok(!t2.includes('Это проверка согласия двух моделей'));
});

test('V13: справочная строка МКРЗ 147 про возраст', async () => {
  const t = await ref(S1());
  assert.ok(t.includes('табл. 2.4'));
  assert.ok(t.includes('0–9 лет — 11,5 (мужчины) и 18,5 (женщины); 30–39 лет — 5,0 и 7,1; 60–69 лет — 1,9 и 3,2'));
  assert.ok(t.includes('к поступлению с пищей не пересчитывается'));
});

test('V13: природные нуклиды — отдельной строкой, в главное число не входят', async () => {
  const t = await ref(NAT());
  assert.ok(t.includes('Природные нуклиды (Ra-226) в главное число не входят'));
  const t0 = await ref(S1());
  assert.ok(!t0.includes('в главное число не входят'));
});

test('V13: состав вкладок результата', async () => {
  const t = await screenOf(S1(), '');
  const present = ['Нормы РФ и ЕАЭС', 'Сравнение с облучением', 'Бытовые риски за 10 лет', 'Подробно (для специалиста)', 'Расчёт и источники'];
  for (const s of present) {
    assert.ok(t.includes(s), s);
  }
  const absent = ['Дозы и риск по органам', 'Источники данных', 'Сравнение с другими источниками облучения'];
  for (const s of absent) {
    assert.ok(!t.includes(s), s);
  }
  const i1 = t.indexOf('Нормы РФ и ЕАЭС');
  const i2 = t.indexOf('Сравнение с облучением');
  const i3 = t.indexOf('Бытовые риски за 10 лет');
  const i4 = t.indexOf('Подробно (для специалиста)');
  const i5 = t.indexOf('Расчёт и источники');
  assert.ok(i1 < i2 && i2 < i3 && i3 < i4 && i4 < i5);
});

test('V13: вкладка «Расчёт и источники» содержит таблицу по нуклидам, главный экран — нет', async () => {
  const tSrc = await screenOf(S1(), 'src');
  assert.ok(tSrc.includes('Расчёт по нуклидам'));
  const tMain = await screenOf(S1(), '');
  assert.ok(!tMain.includes('Расчёт по нуклидам'));
});

test('V13: подпись органной модели — проверка согласия, а не независимая оценка', async () => {
  const t = await ref(inputFor('milk', 'молоко', [['Cs-137', 100]], {}));
  assert.ok(t.includes('Модель EPA — проверка согласия двух моделей, а не независимая оценка'));
});
