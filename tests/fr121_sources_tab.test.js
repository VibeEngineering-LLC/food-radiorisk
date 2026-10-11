// #FR-121 (оператор 2026-10-11: страница «Справка» не нужна; «Ограничения — во «Источники»»): sources.html не собирается и не упоминается; ограничения и лицензии — в конце вкладки «Источники»
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const flat = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const walk = (d) => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const input = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 3 });
const result = computeScenario(data, input);
const srcTab = await renderJsx('src/react/Result.jsx', 'default', { result, input, meta: META, initialTab: 'src' });

test('FR-121: ни сборка, ни код, ни тексты не ссылаются на sources.html; кнопки «Справка» нет', () => {
  for (const f of ['vite.config.js', 'index.html']) assert.ok(!read(f).includes('sources.html'), f);
  const bad = walk(path.join(root, 'src')).filter(f => !f.includes('vendor') && /\.(js|jsx|json|html|css)$/.test(f) && /sources\.html|на странице «Справка»/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad.map(f => path.relative(root, f)), []);
  assert.ok(!/>Справка</.test(read('src/react/App.jsx')));
  assert.ok(!flat(srcTab).includes('Описание каждого документа и методика расчёта'));
});

test('FR-121: 8 пунктов «Известных ограничений» на вкладке «Источники» дословно как в прежнем sources.html (сравнение с файлом)', () => {
  const html = read('sources.html');
  const expected = [...html.match(/<ul id="limits-list">([\s\S]*?)<\/ul>/)[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => flat(m[1]));
  assert.equal(expected.length, 8);
  const tab = srcTab.slice(srcTab.indexOf('id="limits"'));
  const got = [...tab.match(/<ul id="limits-list">([\s\S]*?)<\/ul>/)[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => flat(m[1]));
  assert.deepEqual(got, expected);
  assert.match(srcTab, /<h2 id="limits"[^>]*>Известные ограничения<\/h2>/);
});

test('FR-121: ограничения и ссылка на лицензии — в конце вкладки, под списком литературы; описаний документов нет', () => {
  assert.ok(srcTab.indexOf('class="biblio"') < srcTab.indexOf('id="limits"'));
  assert.ok(srcTab.indexOf('id="limits"') < srcTab.indexOf('id="licenses"'));
  assert.match(srcTab, /<a href="THIRD_PARTY_LICENSES\.txt">THIRD_PARTY_LICENSES\.txt<\/a>/);
  assert.ok(read('vite.config.js').includes("'dist/THIRD_PARTY_LICENSES.txt'"));
});
