// #FR-94: файлы наборов данных запрашиваются с версией ?v=<sha набора>, index.json — с ревалидацией (старый кэш браузера не подсунет старые данные)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadAll, browserFetch } from '../src/data/loader.js';

const read = async (u) => JSON.parse(await readFile(u, 'utf8'));

test('FR-94: loadAll просит файл набора с версией = sha из index.json, index — с no-cache', async () => {
  const calls = [];
  await loadAll(async (u, o) => { calls.push([u, o]); return read(u); });
  const index = await read('public/data/index.json');
  assert.deepEqual(calls[0], ['public/data/index.json', { cache: 'no-cache' }]);
  for (const e of index.datasets) {
    const c = calls.find(([u]) => u === 'public/data/' + e.file);
    assert.ok(c && c[1] && c[1].version && e.json_sha256.startsWith(c[1].version), `версия для ${e.file}`);
  }
});

test('FR-94: browserFetch кладёт версию в URL и передаёт cache', async () => {
  const seen = [];
  globalThis.fetch = async (u, o) => { seen.push([u, o]); return { ok: true, json: async () => ({}) }; };
  await browserFetch('data/compare.json', { version: 'abc123' });
  await browserFetch('data/index.json', { cache: 'no-cache' });
  assert.equal(seen[0][0], 'data/compare.json?v=abc123');
  assert.equal(seen[1][0], 'data/index.json');
  assert.deepEqual(seen[1][1], { cache: 'no-cache' });
});
