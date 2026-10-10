// #FR-81 D-021: коэффициенты риска персонала (4,1·10⁻² / 4,2·10⁻², взрослые работники) убраны из выбора — считаем население
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';

test('D-021: данные записи персонала сохранены, предупреждения про «взрослых» в расчёте нет', () => {
  assert.ok(data.risk.some(r => r.id === 'nrb2009_p23_lifetime_risk_staff'));
  const w = run('milk', 'молоко', [['Cs-137', 1]], { age: '5y', riskCoeffPerSv: 0.041 }).warnings;
  assert.equal(w.filter(x => x.includes('коэффициент риска для взрослых')).length, 0);
});
