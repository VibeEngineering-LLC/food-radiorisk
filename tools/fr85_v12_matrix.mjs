// #FR-85 v12: замер сопоставления названий (статус, запись, непокрытые слова). node tools/fr85_v12_matrix.mjs <out.json> <names.json> ...
import { readFileSync, writeFileSync } from 'node:fs';
import { matchProduct } from '../src/calc/products.js';
const P = JSON.parse(readFileSync(new URL('../public/data/products.json', import.meta.url), 'utf8')).records;
const [out, ...files] = process.argv.slice(2);
const res = {};
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const rows = (Array.isArray(j) ? j : j.names).map((x) => {
    const n = Array.isArray(x) ? x[0] : x;
    const m = matchProduct(P, n);
    return { n, s: m.status, id: m.entry?.id ?? null, c: (m.candidates || []).map((e) => e.id), u: m.uncovered };
  });
  const cnt = {};
  for (const r of rows) cnt[r.s] = (cnt[r.s] || 0) + 1;
  res[f.split(/[\\/]/).pop()] = { count: rows.length, cnt, rows };
  console.log(f.split(/[\\/]/).pop(), rows.length, JSON.stringify(cnt));
}
writeFileSync(out, JSON.stringify(res, null, 1));
