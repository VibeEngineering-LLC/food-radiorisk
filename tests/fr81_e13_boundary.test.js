// #FR-81 E13: округление у границы вердикта — B = 1,0004 не пишется «1»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtNear } from '../src/ui/fmt.js';
import { run } from './fr81_helpers.js';
import { buildReport } from '../src/ui/report.js';

test('E13: fmtNear — у границы показывает больше цифр, вдали от неё как fmtNum', () => {
  assert.equal(fmtNear(1.0004, 1), '1,0004');
  assert.equal(fmtNear(0.3004, 0.3), '0,3004');
  assert.equal(fmtNear(1, 1), '1');
  assert.equal(fmtNear(0.45, 1), '0,45');
});
test('E13: отчёт — молоко 100,04 Бк/кг: «B = 1,0004 … не соответствует»', () => {
  const result = run('milk', 'Молоко', [['Cs-137', 100.04]]);
  const md = buildReport('md', { input: {}, result }, { datasets: 1, records: 1, sha: '0' }, '2026-10-05T00:00:00.000Z').text;
  assert.match(md, /B = 1,0004/);
  assert.equal(result.limits.compliance.verdict, 'nonconforms');
});
