// #FR-81 P2-10 (fix-review-1 №9): срок питания один для всех вкладок — режим «с N до M» берёт M − N, а не поле years
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './fr81_helpers.js';

const life = { fromAge: 20, toAge: 70 };
const at = (years) => run(null, 'молоко', [['Cs-137', 100]], { age: 'adult', lifetime: life, years });
const pick = (r) => [r.rows[0].intakeBqTotal, r.totals.riskTotal, r.totals.doseSvTotal, r.comparison.multi, r.lifeRisks.rows.find(x => x.kind === 'product')?.p];

test('P2-10: «с 20 до 70» при расхождении поля years (3) со сроком 50 даёт то же, что при years = 50 (все вкладки)', () => {
  assert.deepEqual(pick(at(3)), pick(at(50)));
});

test('P2-10: расхождение не молчаливое — результат содержит срок, по которому считали', () => {
  assert.equal(at(3).period?.years, 50);
});

test('P2-10: без режима «с N до M» срок = введённое число лет; дробный меньше 1 и пусто — ошибка', () => {
  assert.equal(run(null, 'молоко', [['Cs-137', 100]], { years: 4 }).period?.years, 4);
  for (const y of [0.5, 0, null]) assert.equal(run(null, 'молоко', [['Cs-137', 100]], { years: y }).ok, false, String(y));
});
