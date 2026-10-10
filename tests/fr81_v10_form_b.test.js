// #FR-81 V10: вердикт B по форме продукта, к которой относится норматив ТР ТС 021/2011 прил. 4 (D-022): свой норматив сухого — активность как есть; нет своего — пересчёт на сырьё A/K; нет K — вердикта нет; готовое блюдо — вердикта нет, зарубежные нормы не показываются; B без Fr
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const near = (a, e, msg) => assert.ok(Math.abs(a - e) < 1e-9, `${msg}: ${a} != ${e}`);
// продукт одного нуклида Cs-137: группа, название, A, ΔA, вид, K и добавки к входу
const mk = (group, name, a, da, state, K, over = {}) => inputFor(group, name, [['Cs-137', a, da]], { product: { name, state }, dryingFactor: K, ...over });
const calc = (input) => computeScenario(data, input);
const draw = async (input, tab) => { const result = calc(input); const html = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: tab }); const text = norm(html); return text.slice(0, tab ? text.length : text.indexOf('Нормы РФ и ЕАЭС')); };

test('V10: свой норматив для сухого — активность как есть, K не применяется', () => {
  const s1 = calc(mk('mushrooms_dried', 'грибы сушёные', 5000, 500, 'dried', 10));
  assert.equal(s1.ok, true);
  near(s1.limits.compliance.B, 2, 'S1 B');
  near(s1.limits.compliance.dB, 0.2, 'S1 dB');
  assert.equal(s1.limits.formNote, null);
  assert.equal(s1.limits.ru[0].limitId, 't021_p4_r18_cs137');
  assert.equal(s1.limits.ru[0].dryNorm, true);
  assert.equal(s1.limits.ru[0].activity, 5000);
  assert.equal(s1.limits.ru[0].converted, undefined);

  const v = calc(mk('vegetables', 'картофель сушёный', 1200, 120, 'dried', 5));
  assert.equal(v.limits.ru[0].limitId, 't021_p4_r13_dry_cs137');
  assert.equal(v.limits.ru[0].H, 600);
  near(v.limits.compliance.B, 2, 'овощи B');
  assert.equal(v.limits.formNote, null);

  // питательная среда сухая на молочной основе (прил. 4, п. 12): «сухая» только в названии группы
  const o = calc(mk('other', 'питательная среда сухая', 320, 32, 'dried', 4));
  assert.equal(o.limits.ru[0].limitId, 't021_p4_r12_cs137');
  near(o.limits.compliance.B, 2, 'питательная среда B');
  assert.equal(o.limits.formNote, null);
});

test('V10: у сушёного нет своего норматива — пересчёт на сырьё A/K', async () => {
  const input = mk('meat', 'говядина сушёная', 1500, 150, 'dried', 5);
  const c = calc(input);
  assert.equal(c.ok, true);
  near(c.limits.compliance.B, 1.5, 'B');
  near(c.limits.compliance.dB, 0.15, 'dB');
  assert.equal(c.limits.ru[0].activity, 300);
  assert.deepEqual(c.limits.ru[0].converted, { aDry: 1500, K: 5 });
  assert.deepEqual(c.limits.formNote, { kind: 'converted', K: 5, items: [{ nuclide: 'Cs-137', aDry: 1500, aRaw: 300 }] });
  near(c.rows[0].rawBqPerKg, 1500, 'A в строке расчёта не меняется');

  const m = calc(mk('milk', 'молоко сухое', 800, 80, 'dried', 8));
  near(m.limits.compliance.B, 1, 'молоко B');
  assert.equal(m.limits.formNote.kind, 'converted');

  const main = await draw(input, '');
  assert.ok(main.includes('Норматив задан для исходного сырья (ТР ТС 021/2011, ст. 7 п. 4), поэтому активность сушёного продукта пересчитана на сырьё, K = 5: цезий-137 — 1 500 / 5 = 300 Бк/кг.'), 'экран: пояснение о пересчёте');
  const ru = await draw(input, 'ru');
  assert.ok(ru.includes('1 500 / 5: пересчёт на сырьё'), 'вкладка норм: пометка пересчёта');
});

test('V10: у сушёного нет своего норматива и нет K — вердикта нет, пояснение', async () => {
  for (const K of [undefined, null, 0.5]) {
    const r = calc(mk('meat', 'говядина сушёная', 1500, 150, 'dried', K));
    assert.equal(r.ok, true, `K=${String(K)}: ok`);
    assert.equal(r.limits.compliance, null, `K=${String(K)}: compliance null`);
    assert.equal(r.limits.formNote.kind, 'no_k', `K=${String(K)}: formNote no_k`);
    assert.equal(r.limits.ru[0].activity, 1500, `K=${String(K)}: активность как есть`);
    assert.equal(r.limits.ru[0].converted, undefined, `K=${String(K)}: converted undefined`);
  }

  const main = await draw(mk('meat', 'говядина сушёная', 1500, 150, 'dried', undefined), '');
  assert.ok(main.includes('для пересчёта на сырьё задайте коэффициент концентрирования при сушке'), 'экран: просьба задать K');
  assert.ok(!main.includes('Показатель B ='), 'экран: нет вердикта B');
});

test('V10: готовое блюдо — вердикта нет, строки норм с пометкой, зарубежные нормы не показываются', async () => {
  const input = mk('meat', 'борщ', 1500, 150, 'cooked', undefined);
  const d = calc(input);
  assert.equal(d.ok, true);
  assert.equal(d.limits.compliance, null);
  assert.deepEqual(d.limits.formNote, { kind: 'cooked' });
  assert.equal(d.limits.foreign.length, 0);
  assert.ok(d.limits.ru.length > 0);
  for (const row of d.limits.ru) {
    assert.equal(row.cooked, true);
    assert.equal(row.limitId, null);
  }

  const fresh = calc(mk('meat', 'борщ', 1500, 150, 'fresh', undefined));
  assert.ok(fresh.limits.foreign.length > 0, 'свежий продукт: зарубежные нормы на месте');

  const ru = await draw(input, 'ru');
  const body = ru.slice(ru.indexOf('Расчёт и источники')); // тело вкладки, без главного экрана (его текст проверяет V04)
  assert.ok((body.match(/для готового блюда не установлен/g) || []).length >= 2, 'вкладка норм: пояснение под таблицей и пометка в ячейке норматива');
  assert.ok(!ru.includes('Показатель B ='), 'вкладка норм: нет вердикта B');
});

test('V10: свежий продукт не меняется; B считается по активности без Fr', () => {
  const f = calc(mk('meat', 'говядина', 1500, 150, 'fresh', undefined));
  near(f.limits.compliance.B, 7.5, 'fresh B');
  assert.equal(f.limits.formNote, null);

  const base = mk('meat', 'говядина', 1500, 150, 'fresh', undefined);
  const withFr = { ...base, processing: { mode: 'fr', fr: 0.5, recordId: null, variant: 'best' } };
  const a = calc(base);
  const b = calc(withFr);
  assert.equal(b.rows[0].frUsed, 0.5);
  near(b.limits.compliance.B, a.limits.compliance.B, 'B не зависит от Fr');
  near(b.limits.compliance.B, 7.5, 'B = 7,5 при Fr = 0,5');
  near(b.totals.doseSvTotal * 2, a.totals.doseSvTotal, 'доза учитывает Fr');
});
