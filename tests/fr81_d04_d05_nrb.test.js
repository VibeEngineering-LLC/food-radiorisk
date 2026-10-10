// #FR-81 D04/D05: НРБ-99/2009 — понятное сообщение при отсутствии e(g); прил. 2а (питьевая вода) к пище не применяется
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

// Вспомогательная функция для запуска сценария НРБ-99/2009
const nrb = (group, name, nuc, age) => run(group, name, nuc, { doseSource: 'NRB2009_App2', age });

// Вспомогательная функция для извлечения записи о дозе из provenance
const doseId = (r) => r.rows[0].provenance.find(p => p.step === 'доза');

test('D04: НРБ, 1–2 года, Cs-137 — сообщение по-русски, без внутренних кодов, с предложением МКРЗ', () => {
    const r = nrb(null, 'молоко', [['Cs-137', 10]], '1-2y');
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /^В НРБ-99\/2009 \(прил\. 2\) для возраста «1–2 года» коэффициента для Cs-137 нет: документ даёт его только для критической группы/);
    assert.match(r.errors[0], /Выберите источник «МКРЗ \(ICRP 119\)»/);
    assert.doesNotMatch(r.errors[0], /NRB2009|e\(g\) для Cs-137, 1-2y/);
});

test('D05: пища, взрослый, Sr-90 — в прил. 2 коэффициента нет (прил. 2а — для воды): ошибка, а не значение из воды', () => {
    const r = nrb('milk', 'молоко', [['Sr-90', 10]], 'adult');
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /«12–17 лет»/);
});

test('D05: пища, взрослый, Cs-137 — запись прил. 2 «с пищей»', () => {
    const r = nrb('milk', 'молоко', [['Cs-137', 10]], 'adult');
    assert.equal(doseId(r).id, 'nrb2009_app2_cs137_food_kg6');
    assert.match(doseId(r).what, /с пищей/);
});

test('D05: вода, взрослый, Sr-90 — прил. 2а с подписью «питьевой водой»', () => {
    const r = nrb('water', 'вода', [['Sr-90', 1]], 'adult');
    assert.equal(doseId(r).id, 'nrb2009_app2a_sr90_water_adult');
    assert.match(doseId(r).what, /питьевой водой/);
});
