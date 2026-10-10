// #FR-83 W09: дети — умолчания нет, справка НКДАР ООН 2000 из данных, в расчёт не идёт
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { listChoices, computeScenario } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { renderJsx } from './render_helper.js';
import { fmtNum } from '../src/ui/fmt.js';
import { T } from '../src/ui/texts_v.js';

const ch = listChoices(data);
const rec = (id) => data.diet.find(r => r.id === id);
const mk = (product, over = {}) => { let r = S.setField(S.setField(S.initialRaw(ch), ch, 'measuredForm', 'fresh'), ch, 'product', product); for (const [k, v] of Object.entries(over)) r = S.setField(r, ch, k, v); return r; };
const page = async (raw) => { const html = await renderJsx('src/react/Form.jsx', 'default', { choices: ch, raw, setRaw() {}, tab: 1, setTab() {}, onPreset() {}, onExport() {} }); return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ') }; };

test('ребёнок 1 год, «по умолчанию»: сообщение «не установлено», строки умолчания нет', async () => {
    const { html, text } = await page(mk('Молоко', { age: '1y' }));
    assert.ok(text.includes(T.DIET_CHILD));
    assert.ok(html.includes('id="dietNotSet"'));
    assert.ok(!html.includes('id="dietLine"'));
});

test('справка показывает две колонки: 1 год и 10 лет (без взрослого, #FR-85 v14 п. 10), по всем семи строкам', async () => {
    const { html, text } = await page(mk('Молоко', { age: '1y' }));
    assert.ok(html.includes('id="dietChild"'));
    assert.ok(text.includes('НКДАР ООН 2000'));
    for (const [group, label] of Object.entries(T.DIET_CHILD_ROWS)) {
        assert.ok(text.includes(label));
        for (const age of ['1y', '10y']) {
            const record = data.diet.find(r => r.series === 'child_ref' && r.group === group && r.age === age);
            assert.ok(record, `Record not found for group ${group}, age ${age}`);
            assert.ok(text.includes(fmtNum(record.value)));
        }
    }
});

test('ребёнок: масса для расчёта не подставляется, ядро отвечает ошибкой с текстом для детей', async () => {
    const raw = mk('Молоко', { age: '1y' });
    const input = S.toInput(raw, ch);
    const result = computeScenario(data, input);
    assert.equal(input.portionKg, null);
    assert.equal(input.portionsPerYear, null);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes(T.DIET_CHILD));
});

test('взрослый: справки для детей нет', async () => {
    const { html } = await page(mk('Молоко'));
    assert.ok(!html.includes('id="dietChild"'));
    assert.ok(!html.includes('НКДАР ООН 2000'));
});

test('режим «с возраста 5 лет» для взрослого возраста питания: справка для детей, умолчания нет', async () => {
    const { html } = await page(mk('Молоко', { lifeMode: true, startAge: '5', endAge: '70', doseSource: 'ICRP119_F1' }));
    assert.ok(html.includes('id="dietNotSet"'));
    assert.ok(!html.includes('id="dietLine"'));
});

test('режим «знаю» у ребёнка: справки нет, поля ввода доступны', async () => {
    const { html } = await page(mk('Молоко', { age: '1y', dietMode: 'own' }));
    assert.ok(!html.includes('id="dietChild"'));
    assert.ok(!/id="portionG"[^>]*disabled/.test(html));
});
