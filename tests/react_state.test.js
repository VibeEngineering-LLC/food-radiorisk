import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { listChoices } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const ch = listChoices(data);
const r0 = S.initialRaw(ch), bil = S.setField(r0, ch, 'product', 'черника');
test('React-состояние: начальная форма = старые значения по умолчанию', () => {
  const i = S.toInput(r0, ch);
  assert.deepEqual([i.age, i.nuclides[0].nuclide, i.portionKg, i.portionsPerYear, i.nuclides[0].transferId], ['adult', 'Cs-137', 0.1, 12, null]);
});
test('React-состояние: продукт подтягивает группу норм, сухое вещество, сводную КП и обработку; исходник не меняется', () => {
  assert.equal(r0.product, '');
  assert.ok(bil.foodGroup && bil.dryMatter, JSON.stringify([bil.foodGroup, bil.dryMatter]));
  assert.equal(S.transferView(bil, ch, 0).value, 'ALL');
  assert.ok(S.procView(bil, ch).options.length > 0);
});
