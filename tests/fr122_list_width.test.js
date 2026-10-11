// #FR-122 (оператор 2026-10-11: «подпункты по ширине блока форматируй»): списки и примечания в блоках и вкладках результата не уже соседних абзацев
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = ['styles.css', 'window.css'].map(f => readFileSync(root + 'src/ui/' + f, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

// мини-каскад: max-width, действующий на li внутри заданного предка (самое специфичное правило; при равенстве — позднее)
function liMaxWidth(ancestor) {
  const spec = { 'li': 1, [ancestor + ' li']: 11, [ancestor + ' ul']: 0, '.science li': 11, '.tabbody li': 11 };
  let best = { s: -1, v: null };
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const mw = m[2].match(/(?:^|;|\s)max-width:\s*([^;]+)/);
    if (!mw || m[1].includes('@')) continue;
    for (const sel of m[1].split(',').map(s => s.trim())) if (spec[sel] >= 1 && spec[sel] >= best.s) best = { s: spec[sel], v: mw[1].trim() };
  }
  return best.v;
}

test('FR-122: у пунктов списка в блоке риска (.riskbox / .rs-notes) нет max-width меньше 100 %', () => {
  for (const anc of ['.riskbox', '.rs-notes']) {
    const v = liMaxWidth(anc);
    assert.ok(v === 'none' || v === '100%', `${anc} li: max-width ${v}`);
  }
});

test('FR-122: у пунктов списков во вкладках результата (.tabbody li) нет max-width меньше 100 %', () => {
  const v = liMaxWidth('.tabbody');
  assert.ok(v === 'none' || v === '100%', `max-width ${v}`);
});

test('FR-122: выравнивание списков — по левому краю', () => {
  assert.match(css, /\.riskbox ul[^{]*\{[^}]*text-align:\s*left/);
});
