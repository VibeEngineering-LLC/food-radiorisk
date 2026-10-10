// #FR-83 W02: каждый источник записей набора diet есть в реестре источников и в кратких названиях
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { data } from './fr81_helpers.js';
const read = async (p) => JSON.parse(await readFile(new URL('../' + p, import.meta.url), 'utf8'));

test('источники diet.json: есть в sources.json (название) и в source_short.json', async () => {
  const reg = (await read('public/data/sources.json')).sources;
  const short = await read('src/ui/source_short.json');
  const used = [...new Set(data.diet.filter(r => r.kind === 'value').map(r => r.source))];
  assert.ok(used.length >= 6, `источников в наборе: ${used.length}`);
  for (const code of used) {
    assert.ok(reg[code]?.title_ru, `${code}: нет в sources.json`);
    assert.ok(short[code], `${code}: нет в source_short.json`);
  }
});
