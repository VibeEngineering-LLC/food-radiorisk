// #FR-88 v21, слой c: печатный отчёт против экрана (tools/check_report_vs_screen.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAll } from '../tools/check_report_vs_screen.mjs';

// Z109: юрисдикция в таблице зарубежных норм отчёта — по-русски, как на экране (JUR_RU), а не кодом EU/Japan/USA/Codex; скрипт ищет «нуклид + название юрисдикции» и в экране, и в md, и в html
test('слой c: числа, вердикт, подписи и предупреждения отчёта совпадают с экраном (сверка на 4 сценариях скриптом)', async () => {
  const res = await checkAll(['milk-default', 'cocoa-default', 'dried-no-k', 'input-error']);
  assert.equal(res.length, 4);
  for (const r of res) assert.deepEqual(r.fails, [], r.id);
  assert.ok(res.every((r) => r.checks > 0));
  assert.ok(res.find((r) => r.id === 'milk-default').checks > 100);
});
