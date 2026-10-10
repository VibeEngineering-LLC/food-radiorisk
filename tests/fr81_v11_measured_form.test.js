// #FR-81 V11: поле «В каком виде измерен продукт» — обязательное, три значения; для готового блюда Fr = 1 (D-022)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screen, ch } from './render_scenario.js';
import { data, run } from './fr81_helpers.js';
import { listChoices, computeScenario } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { serialize, restore } from '../src/react/persist.js';
import { T } from '../src/ui/texts_v.js';

test('V11: пустое поле — ошибка расчёта с текстом T.FORM_STATE_REQUIRED', () => {
  const raw = S.setField(S.initialRaw(ch), ch, 'product', 'молоко');
  assert.equal(raw.measuredForm, '');
  const r = computeScenario(data, S.toInput(raw, ch));
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes(T.FORM_STATE_REQUIRED));
});

test('V11: готовое блюдо — выбранный Fr 0,3 не применяется, доза как при Fr = 1', () => {
  const a = run(null, 'молоко', [['Cs-137', 100]], {
    product: { name: 'молоко', state: 'cooked' },
    processing: { mode: 'fr', fr: 0.3, recordId: null, variant: 'best' }
  });
  const b = run(null, 'молоко', [['Cs-137', 100]], {
    product: { name: 'молоко', state: 'fresh' }
  });
  assert.equal(a.ok, true);
  assert.equal(a.rows[0].frUsed, 1);
  assert.equal(a.rows[0].doseSvPerYear, b.rows[0].doseSvPerYear);
  assert.ok(a.warnings.some(w => w.includes('готовое блюдо')));

  const c = run(null, 'молоко', [['Cs-137', 100]], {
    product: { name: 'молоко', state: 'fresh' },
    processing: { mode: 'fr', fr: 0.3, recordId: null, variant: 'best' }
  });
  assert.ok(c.rows[0].doseSvPerYear < b.rows[0].doseSvPerYear);
});

test('V11: через форму — cooked сбрасывает выбранный способ обработки', () => {
  let raw = S.initialRaw(ch);
  raw = S.setField(raw, ch, 'product', 'молоко');
  raw = S.setField(raw, ch, 'measuredForm', 'cooked');
  raw = S.setField(raw, ch, 'procMode', 'fr');
  raw = S.setField(raw, ch, 'procFr', '0.3');
  const input = S.toInput(raw, ch);
  assert.equal(input.processing.mode, 'none');
  assert.equal(input.processing.fr, 1);
});

test('V11: сохранённое состояние старого вида productState не переносится', () => {
  const base = S.initialRaw(listChoices(data));
  const back = restore(serialize({ ...base, productState: 'dried' }, 0), base, listChoices(data).nuclides);
  assert.equal(back.raw.measuredForm, base.measuredForm);
  assert.equal('productState' in back.raw, false);
});

test('V11: форма — три варианта вида продукта; при готовом блюде вместо блока обработки текст про Fr = 1', async () => {
  const raw0 = S.setField(S.initialRaw(ch), ch, 'product', 'молоко');
  const html0 = (await screen({
    comp: ['src/react/Form.jsx', 'default', () => ({
      choices: ch,
      raw: raw0,
      setRaw() {},
      tab: 0,
      setTab() {},
      onPreset() {},
      onExport() {}
    })]
  })).html;

  for (const [, t] of T.FORM_STATE_OPTS) {
    assert.ok(html0.includes(t));
  }

  const raw1 = S.setField(S.setField(S.initialRaw(ch), ch, 'product', 'молоко'), ch, 'measuredForm', 'cooked');
  const html1 = (await screen({
    comp: ['src/react/Form.jsx', 'default', () => ({
      choices: ch,
      raw: raw1,
      setRaw() {},
      tab: 1,
      setTab() {},
      onPreset() {},
      onExport() {}
    })]
  })).html;
  assert.ok(html1.includes(T.FORM_COOKED_FR));
  assert.ok(!html1.includes('свой Fr'));

  const raw2 = S.setField(S.setField(S.initialRaw(ch), ch, 'product', 'молоко'), ch, 'measuredForm', 'fresh');
  const html2 = (await screen({
    comp: ['src/react/Form.jsx', 'default', () => ({
      choices: ch,
      raw: raw2,
      setRaw() {},
      tab: 1,
      setTab() {},
      onPreset() {},
      onExport() {}
    })]
  })).html;
  assert.ok(!html2.includes(T.FORM_COOKED_FR));
  assert.ok(html2.includes('свой Fr'));
});
