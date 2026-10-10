// #FR-83 W07: блок «Рацион» формы — режимы, строки умолчания, «не установлено», год из данных, недоступные поля
import { data } from './fr81_helpers.js';
import { listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { renderJsx } from './render_helper.js';
import { fmtNum } from '../src/ui/fmt.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ch = listChoices(data);
const rec = (id) => data.diet.find(r => r.id === id);

const mk = (product, over = {}) => {
  let r = S.setField(S.setField(S.initialRaw(ch), ch, 'measuredForm', 'fresh'), ch, 'product', product);
  for (const [k, v] of Object.entries(over)) r = S.setField(r, ch, k, v);
  return r;
};

const page = async (raw, choices = ch) => {
  const html = await renderJsx('src/react/Form.jsx', 'default', { choices, raw, setRaw() {}, tab: 1, setTab() {}, onPreset() {}, onExport() {} });
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ') };
};

test('«Картофель», по умолчанию: значение из данных, год, Росстат, справочно норма № 614, поля ввода недоступны', async () => {
  const b = rec('diet_bal2025_potato'), n = rec('diet_n614_potato');
  const { html, text } = await page(mk('Картофель'));
  assert.ok(text.includes(fmtNum(b.value)));
  assert.ok(text.includes(String(b.year)));
  assert.ok(text.includes('Росстат'));
  assert.ok(text.includes(fmtNum(n.value)));
  assert.ok(text.includes('№ 614'));
  assert.ok(html.includes('id="dietLine"'));
  assert.match(html, /id="portionG"[^>]*disabled/);
  assert.match(html, /id="monthsPerYear"[^>]*disabled/);
  assert.ok(html.match(/value="default"[^>]*checked/) || html.match(/checked=""[^>]*value="default"/));
});

test('«Белые грибы»: «оценка методики, не норма», справочно обследование бюджетов', async () => {
  const { html, text } = await page(mk('Белые грибы'));
  assert.ok(text.includes('оценка методики, не норма'));
  assert.ok(text.includes(fmtNum(rec('diet_mu2153_mushrooms').value)));
  assert.ok(html.includes('id="dietInfo"'));
});

test('«черника»: «не установлено», кнопка «Ввести свою величину», строки умолчания нет', async () => {
  const { html, text } = await page(mk('черника лесная'));
  assert.ok(text.includes('не установлено'));
  assert.ok(text.includes('Ввести свою величину'));
  assert.ok(html.includes('id="dietNotSet"'));
  assert.ok(!html.includes('id="dietLine"'));
});

test('год берётся из данных: подмена года в записи баланса меняет подпись', async () => {
  const ch2 = { ...ch, diet: ch.diet.map(r => r.id === 'diet_bal2025_potato' ? { ...r, year: 2024 } : r) };
  const { text } = await page(mk('Картофель'), ch2);
  assert.ok(text.includes('2024 г.'));
});

test('«знаю»: поля ввода доступны, строки умолчания нет', async () => {
  const { html } = await page(mk('Картофель', { dietMode: 'own', portionG: '50' }));
  assert.ok(!html.match(/id="portionG"[^>]*disabled/));
  assert.ok(!html.includes('id="dietLine"'));
  assert.match(html, /id="portionG"[^>]*value="50"/);
});

test('«высокое»: мясо — 10-я децильная группа; картофель — высокое не установлено', async () => {
  const { text: t1 } = await page(mk('Говядина', { dietMode: 'high' }));
  assert.ok(t1.includes('10-я децильная группа'));
  assert.ok(t1.includes('самые обеспеченные'), 'строка «Принято» — по 10-й децильной группе, а не по балансу');
  assert.ok(t1.includes(fmtNum(rec('diet_d10_2025_meat').value)));

  const { html: h2, text: t2 } = await page(mk('Картофель', { dietMode: 'high' }));
  assert.ok(h2.includes('id="dietNotSet"'));
  assert.ok(t2.includes('Высокое потребление'));
});

test('охват группы: для мяса «принято, что вся она — ваш продукт», для картофеля такой строки нет', async () => {
  const { html: h1, text: t1 } = await page(mk('Говядина'));
  assert.ok(h1.includes('id="dietScope"'));
  assert.ok(t1.includes('вся она — ваш продукт'));

  const { html: h2 } = await page(mk('Картофель'));
  assert.ok(!h2.includes('id="dietScope"'));
});

test('ряды различаются: баланс и 10-я децильная группа рядом', async () => {
  const { text } = await page(mk('Говядина'));
  assert.ok(text.includes('Ряды Росстата различаются'));
  assert.ok(text.includes(fmtNum(rec('diet_bal2025_meat').value)));
  assert.ok(text.includes(fmtNum(rec('diet_d10_2025_meat').value)));
});

test('речная рыба: не установлено, справочно вся рыба по России', async () => {
  const { html, text } = await page(mk('Рыба речная'));
  assert.ok(html.includes('id="dietNotSet"'));
  assert.ok(html.includes('id="dietInfo"'));
  assert.ok(text.includes('вся рыба по России'));
  assert.ok(text.includes(fmtNum(rec('diet_bal2025_fish').value)));
  assert.ok(!/,\s*\)/.test(text), 'в справочной строке нет пустого поля (год уже входит в название ряда)');
});

test('сушёный продукт: сообщение о свежем продукте', async () => {
  const { text } = await page(mk('Картофель', { measuredForm: 'dried' }));
  assert.ok(text.includes('для сушёного продукта и готового блюда'));
});

test('грибы, «высокое»: причина — нет отдельного ряда дециля, а не «ниже среднего»', async () => {
  const { html, text } = await page(mk('Белые грибы', { dietMode: 'high' }));
  assert.ok(html.includes('id="dietNotSet"'));
  assert.ok(text.includes('нет отдельного ряда'));
});
