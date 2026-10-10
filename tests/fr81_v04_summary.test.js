// #FR-81 V04: главный экран результата — блоки A (риск), B (соответствие нормам), C (доза и нормы) на сценариях S1, S2, S5 (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const draw = async (input, patch = {}) => { const result = { ...computeScenario(data, input), ...patch }; const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META }); return { html, text: norm(html), result }; };
const main = (text) => text.slice(0, text.indexOf('Нормы РФ и ЕАЭС'));
const at = (text, s) => { const i = text.indexOf(s); assert.ok(i >= 0, 'нет в тексте: ' + s); return i; };

const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const S2 = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const S5 = () => inputFor('mushrooms_fresh', 'грибы свежие', [['Cs-137', 400, 40]], { portionKg: 0.3, portionsPerYear: 60, years: 1 });

test('V04: S1 — порядок блоков A→B→C и числа', async () => {
  const { text } = await draw(S1());
  const t = main(text);
  const i1 = at(t, 'Риск от этого питания за 10 лет');
  const i2 = at(t, '16 на 1 000 000');
  const i3 = at(t, 'Номинальный риск смерти от последствий облучения для условного человека');
  const i4 = at(t, 'По дозе это столько же, сколько 49 дней природного фона, 4,1 рентгеновского снимка грудной клетки или 97 часов полёта на самолёте.');
  const i5 = at(t, 'Оценка по дозе самого нагруженного года (33 мкЗв за год): выше пренебрежимо малого уровня 10 мкЗв, но ниже годового предела 1 мЗв');
  const i6 = at(t, 'Риск отвечает на вопрос');
  const i7 = at(t, 'Соответствие продукта нормам');
  const i8 = at(t, 'Продукт по нормам ТР ТС 021/2011: не соответствует.');
  const i9 = at(t, 'Показатель B = 2 ± 0,2. Норматив для «грибы сушеные»: цезий-137 — 2 500 Бк/кг; измерено 5 000 Бк/кг.');
  const i10 = at(t, 'Это отдельная проверка');
  const i11 = at(t, 'Доза и нормы облучения');
  assert.ok(i1 < i2 && i2 < i3 && i3 < i4 && i4 < i5 && i5 < i6 && i6 < i7 && i7 < i8 && i8 < i9 && i9 < i10 && i10 < i11);
});

test('V04: S5 — одно число и одна оценка', async () => {
  const { text } = await draw(S5());
  const t = main(text);
  assert.ok(t.includes('4,6 на 1 000 000'));
  assert.ok(t.includes('У детей риск выше — примерно вдвое (по МКРЗ 147, с. 6 — до трёх раз), у пожилых ниже'));
  assert.ok(!t.includes('вдвое–втрое'));
  assert.ok(t.includes('Продукт по нормам ТР ТС 021/2011: соответствует.'));
});

test('V04: S2 — режим «с 3 до 13 лет»: заголовок и год максимума', async () => {
  const { text } = await draw(S2());
  const t = main(text);
  assert.ok(t.includes('Риск от этого питания с 3 до 13 лет'));
  assert.ok(t.includes('за 10-й год, возраст 12–13 лет): выше пренебрежимо малого уровня'));
  assert.ok(t.includes('Продукт по нормам ТР ТС 021/2011: соответствует.'));
  assert.ok(t.includes('цезий-137 — 100'));
});

test('V04: запрещённые слова на главном экране', async () => {
  const forbidden = [/ваш риск/, /1 из /, /пренебрежимо малый риск/, /20 мкЗв/, /Ē₅/, /ущерб/, /заболеть раком/, /независим/];
  const scenarios = [S1(), S2(), S5()];
  for (const input of scenarios) {
    const { text } = await draw(input);
    const t = main(text);
    for (const re of forbidden) {
      assert.doesNotMatch(t, re);
    }
  }
});

test('V04: цвет — только у плашки B, по вердикту', async () => {
  const { html: htmlS1 } = await draw(S1());
  assert.match(htmlS1, /class="riskbox vb risk-exceeds"/);
  assert.match(htmlS1, /class="riskbox rs"/);
  assert.doesNotMatch(htmlS1, /class="riskbox rs risk-/);

  const { html: htmlS5 } = await draw(S5());
  assert.match(htmlS5, /class="riskbox vb risk-negligible"/);
});

test('V04: сушёный/готовое блюдо без вердикта', async () => {
  const input = { ...S5(), product: { name: 'блюдо', state: 'cooked' } };
  const { text } = await draw(input);
  const t = main(text);
  assert.ok(t.includes('Норматив ТР ТС для готового блюда не установлен'));
  assert.ok(!t.includes('Показатель B ='));
});

test('V04: только природные нуклиды — число и словесная оценка не выводятся', async () => {
  const input = inputFor(null, 'вода', [['Ra-226', 1]], {});
  const { text } = await draw(input);
  const t = main(text);
  assert.ok(t.includes('словесной оценки нет'));
  assert.ok(!t.includes('на 1 000 000'));
});

test('V04: возраст до 1 года — оговорка про «3 месяца», у взрослого её нет', async () => {
  const infant = await draw({ ...S5(), age: '3m' });
  assert.ok(main(infant.text).includes('коэффициентам МКРЗ для возраста «3 месяца»'));
  assert.ok(!main((await draw(S5())).text).includes('«3 месяца»'));
});

test('V04: точность измерения недостаточна — плашка B предупреждает', async () => {
  const wide = await draw(inputFor('mushrooms_fresh', 'грибы свежие', [['Cs-137', 400, 300]], { portionKg: 0.3, portionsPerYear: 60, years: 1 }));
  assert.ok(main(wide.text).includes('нужно ΔB не больше 0,3'));
  assert.ok(!main((await draw(S5())).text).includes('нужно ΔB не больше 0,3'));
});

test('V04: доза выше 1 мЗв — класс c3; выше 5 мЗв — другая вторая фраза', async () => {
  const big = (a) => draw(inputFor(null, 'молоко', [['Cs-137', a]], { portionKg: 1, portionsPerYear: 1, constantActivity: true }));
  const two = main((await big(1.5e-3 / 1.3e-8)).text), six = main((await big(6e-3 / 1.3e-8)).text);
  assert.ok(two.includes('выше годового предела 1 мЗв') && two.includes('В отдельный год допускается до 5 мЗв'));
  assert.ok(six.includes('Это больше 5 мЗв — наибольшей дозы') && !six.includes('В отдельный год допускается до 5 мЗв'));
});
