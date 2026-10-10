// Загрузка public/data/*.json. fetchJson(url) → Promise<object> подставляется снаружи:
// в браузере — fetch(...).then(r => r.json()), в Node-тестах — чтение файла.
export async function loadAll(fetchJson, base = 'public/data/') {
  // #FR-94: index.json всегда сверяется с сервером (cache: 'no-cache'), файлы наборов запрашиваются с версией ?v=<sha набора> — устаревший кэш браузера/Pages не подсунет старый набор
  const index = await fetchJson(base + 'index.json', { cache: 'no-cache' });
  const data = {}, meta = {};
  for (const e of index.datasets) {
    const doc = await fetchJson(base + e.file, { version: String(e.json_sha256 || '').slice(0, 16) });
    if (doc.record_count !== doc.records.length) throw new Error(`${e.dataset}: record_count не сходится`);
    data[e.dataset] = doc.records;
    meta[e.dataset] = { sha: doc.source_sha256, jsonSha: e.json_sha256, count: doc.record_count };
  }
  return { data, meta };
}

export const browserFetch = (url, opts = {}) =>
  fetch(opts.version ? `${url}?v=${opts.version}` : url, opts.cache ? { cache: opts.cache } : undefined).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
