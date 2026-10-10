// #FR-81 D12: сводная оценка плотности загрязнения — медиана + квартили (25–75 %) + min–max, с подписью «разброс по источникам КП»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, run } from './fr81_helpers.js';
import { depositionHtml } from '../src/ui/product.js';

const ids = data.transfer.filter(r => /bilberry/.test(r.id) && /sr_90/.test(r.id)).map(r => r.id);
const n = { nuclide: 'Sr-90', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, transferId: 'ALL', transferIds: ids, variant: 'central', samplePrep: { mode: 'as_is', concentrationFactor: 1 } };
const r = run(null, 'черника лесная', [], { nuclides: [n] });

test('D12: сводная оценка — в подписи медиана, квартили 25–75 %, min–max и пометка о разбросе по источникам КП', () => {
  const html = depositionHtml(r.rows);
  assert.match(html, /медиана [^;]+; квартили \(25–75 %\) [^;]+ – [^;]+; min–max [^;]+ – [^;]+ кБк\/м²/);
  assert.match(html, /разброс по источникам КП, а не погрешность оценки/);
});
test('D12: min ≤ q25 ≤ медиана ≤ q75 ≤ max', () => {
  const e = r.rows[0].depositionEstimate, s = e.summary;
  assert.ok(s.fullMin <= e.kBqPerM2.min && e.kBqPerM2.min <= e.kBqPerM2.central && e.kBqPerM2.central <= e.kBqPerM2.max && e.kBqPerM2.max <= s.fullMax);
});
