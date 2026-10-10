// #FR-81 V12: блок «Доза и нормы облучения» (C) и отсутствие «20 мкЗв» на всём экране результата (D-022: ориентир МУК 0,1 мЗв не применяется)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const draw = async (input) => { const result = computeScenario(data, input); const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META }); return norm(html); };
const S1 = () => inputFor('mushrooms_dried', 'грибы сушёные', [['Cs-137', 5000, 500]], { portionKg: 0.02, portionsPerYear: 25, years: 10, constantActivity: true, dryingFactor: 10, product: { name: 'грибы сушёные', state: 'dried' } });
const S2 = () => inputFor('milk', 'молоко', [['Cs-137', 50, 5], ['Sr-90', 10, 1]], { age: '5y', portionKg: 0.5, portionsPerYear: 365, years: 10, lifetime: { fromAge: 3, toAge: 13 } });
const S5 = () => inputFor('mushrooms_fresh', 'грибы свежие', [['Cs-137', 400, 40]], { portionKg: 0.3, portionsPerYear: 60, years: 1 });
const blockC = (t) => t.slice(t.indexOf('Доза и нормы облучения'), t.indexOf('Нормы РФ и ЕАЭС'));

test('V12: S1 — блок C', async () => {
  const c = blockC(await draw(S1()));
  assert.ok(c.includes('Доза за самый нагруженный год: 33 мкЗв (все годы одинаковы). Это 3,3 % годового предела 1 мЗв, но этот предел установлен для всего техногенного облучения человека вместе, а не для одного продукта (НРБ-99/2009, табл. 3.1).'));
  assert.ok(c.includes('Пренебрежимо малый уровень дозы — 10 мкЗв в год (ОСПОРБ-99/2010, принцип оптимизации); у вас — 33 мкЗв за год.'));
  assert.ok(c.includes('Доза за весь срок: 330 мкЗв — 0,46 % ограничения 70 мЗв за 70 лет жизни для всего техногенного облучения (НРБ-99/2009, п. 3.1.4).'));
});

test('V12: S5 — год один, без пометки об одинаковых годах, доля 1 мЗв по дозе года', async () => {
  const c = blockC(await draw(S5()));
  assert.ok(c.includes('Доза за самый нагруженный год: 93 мкЗв. Это 9,3 % годового предела'));
  assert.ok(!c.includes('все годы одинаковы'));
});

test('V12: S2 — год максимума с возрастом', async () => {
  const c = blockC(await draw(S2()));
  assert.ok(c.includes('Доза за самый нагруженный год: 210 мкЗв (10-й год, возраст 12–13 лет).'));
});

test('V12: «20 мкЗв», п. 1.4 и ориентир МУК 0,1 мЗв нигде на экране результата не встречаются', async () => {
  const scenarios = [S1(), S2(), S5()];
  for (const input of scenarios) {
    const t = await draw(input);
    assert.doesNotMatch(t, /(?<![\d,])20 мкЗв/); // не часть числа вроде «120 мкЗв»
    assert.doesNotMatch(t, /п\. 1\.4/);
    assert.doesNotMatch(t, /0,1 мЗв/);
    assert.doesNotMatch(t, /МУК 2\.6\.1\.1194-03, п\. 3\.2\.1/);
  }
});

test('V12: только природные нуклиды — вместо дозы нормам сказано, что предел не установлен', async () => {
  const c = blockC(await draw(inputFor(null, 'вода', [['Ra-226', 1]], {})));
  assert.ok(c.includes('В продукте только природные нуклиды (Ra-226): пределы дозы для них нормами не установлены.'));
});
