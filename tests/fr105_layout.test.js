// #FR-105 v45: охранные правила вёрстки (без браузера): на 360 px ничего не прокручивается вбок вне обёрток таблиц
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
const find = (selRe, bodyRe) => rules.some(r => selRe.test(r.sel) && bodyRe.test(r.body));

test('сетка итогов и карточки: min-width: 0, max-width: 100% (карточки не шире блока)', () => {
  assert.ok(find(/\.kgrid\s*>\s*\*/, /min-width:\s*0/), '.kgrid > * { min-width: 0 }');
  assert.ok(find(/\.kgrid\s*>\s*\*/, /max-width:\s*100%/), '.kgrid > * { max-width: 100% }');
  assert.ok(find(/\.kgrid\s+\.kpi/, /overflow-wrap:\s*anywhere/), 'текст карточек переносится');
});

test('узкий экран: inline max-content-колонка сетки перебита (!important), подпись строки переносится', () => {
  const m = css.match(/@media \(max-width: 640px\)\s*\{(.*)\}\s*\/\*[^\n]*\n/);
  assert.ok(m, 'есть @media (max-width: 640px) с сеткой итогов');
  assert.match(m[1], /\.kgrid:not\(\.one\)\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(m[1], /\.kgrid \.kr\s*\{[^}]*white-space:\s*normal/);
});

test('ссылки источников и текст вкладок переносятся по любому символу', () => {
  assert.ok(find(/ol\.biblio a/, /overflow-wrap:\s*anywhere/), 'ol.biblio a');
  assert.ok(find(/\.tabbody a/, /overflow-wrap:\s*anywhere/), '.tabbody a');
});

test('заголовок числового столбца легенды диаграммы переносится (перебивает nowrap у th.num)', () => {
  assert.ok(find(/\.pie-legend thead th\.num/, /white-space:\s*normal/));
});
