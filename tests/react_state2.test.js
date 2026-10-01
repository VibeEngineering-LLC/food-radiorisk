import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { listChoices } from '../src/calc/model.js';
import { presetRadGear } from '../src/ui/form.js';
import * as S from '../src/react/formState.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const ch = listChoices(data), bil = S.setField(S.initialRaw(ch), ch, 'product', 'черника');
test('React-состояние: ручной % сухого вещества и выбор «не оценивать» переживают смену продукта', () => {
  const u = S.setNuclideField(S.setField(bil, ch, 'dryMatter', '7'), 0, 'transfer', ''), g = S.setField(u, ch, 'product', 'голубика');
  assert.deepEqual([g.dryMatter, S.transferView(g, ch, 0).value], ['7', '']);
  assert.notEqual(S.setField(g, ch, 'dryMatter', '').dryMatter, '');
});
test('React-состояние: отмеченная обработка чужого продукта не уходит в расчёт; пример RadGear восстанавливается', () => {
  const id = S.procView(bil, ch).options[0].value, m = S.setField({ ...bil, procMode: 'record', procRecs: [id] }, ch, 'product', 'молоко');
  assert.deepEqual([S.toInput({ ...bil, procMode: 'record', procRecs: [id] }, ch).processing.recordIds, S.toInput(m, ch).processing.recordIds], [[id], []]);
  const i = S.toInput(S.rawFromInput(presetRadGear(), ch), ch);
  assert.deepEqual([i.portionKg, i.portionsPerYear, i.nuclides[0].measuredBqPerKg, i.foodGroupCode, i.product.state], [0.1046, 1, 9800, 'mushrooms_dried', 'dried']);
});
