// #FR-57: CSS библиотеки для Claude Design — образец того же вида, что минифицированный вывод lightningcss в dist-lib
import test from 'node:test';
import assert from 'node:assert/strict';
import { dsCss } from '../vite.lib.config.js';

const SAMPLE = ':root{--bg:#f0f0f0;--mono:Consolas,"Cascadia Mono",monospace;--sans:"Segoe UI",Tahoma,sans-serif}' +
  '@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1e1f22;--ink:#e3e6ea}}' +
  ':root[data-theme=dark]{--bg:#1e1f22}html{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light dark}' +
  '@media (max-width:800px){.split{grid-template-columns:minmax(0,1fr)}}';

test('dsCss: повторный тёмный блок по prefers-color-scheme убран, data-theme=dark и прочие @media на месте', () => {
  const out = dsCss(SAMPLE);
  assert.equal(out.includes('prefers-color-scheme'), false);
  assert.ok(out.includes(':root[data-theme=dark]{--bg:#1e1f22}'));
  assert.ok(out.includes('@media (max-width:800px){.split{grid-template-columns:minmax(0,1fr)}}'));
});

test('dsCss: шрифтовые токены помечены @kind font, служебные lightningcss — @kind other', () => {
  const out = dsCss(SAMPLE);
  assert.ok(out.includes('--mono:Consolas,"Cascadia Mono",monospace;/* @kind font */'));
  assert.ok(out.includes('--sans:"Segoe UI",Tahoma,sans-serif;/* @kind font */}'));
  assert.ok(out.includes('--lightningcss-light:initial;/* @kind other */--lightningcss-dark: ;/* @kind other */color-scheme'));
});
