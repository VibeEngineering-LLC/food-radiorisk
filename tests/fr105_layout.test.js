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

// #FR-115 (решение оператора 2026-10-11): колонки подписей строк нет, сетка итогов — две колонки без inline-стиля и без !important; прежние правила @media для .kr убраны
test('сетка итогов: две колонки на всю ширину, без колонки подписей и без !important', () => {
  assert.ok(find(/\.kgrid$/,/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/), '.kgrid — две колонки');
  assert.ok(!/\.kgrid[^{]*\.kr\b/.test(css), 'правил для .kr нет');
  const kg = css.split('\n').filter(l => /\.kgrid/.test(l));
  assert.ok(kg.every(l => !/!important/.test(l)), 'в правилах .kgrid нет !important');
});

test('ссылки источников и текст вкладок переносятся по любому символу', () => {
  assert.ok(find(/ol\.biblio a/, /overflow-wrap:\s*anywhere/), 'ol.biblio a');
  assert.ok(find(/\.tabbody a/, /overflow-wrap:\s*anywhere/), '.tabbody a');
});

test('заголовок числового столбца легенды диаграммы переносится (перебивает nowrap у th.num)', () => {
  assert.ok(find(/\.pie-legend thead th\.num/, /white-space:\s*normal/));
});
