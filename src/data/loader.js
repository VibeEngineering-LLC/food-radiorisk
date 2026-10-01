// Загрузка public/data/*.json. fetchJson(url) → Promise<object> подставляется снаружи:
// в браузере — fetch(...).then(r => r.json()), в Node-тестах — чтение файла.
export async function loadAll(fetchJson, base = 'public/data/') {
  const index = await fetchJson(base + 'index.json');
  const data = {}, meta = {};
  for (const e of index.datasets) {
    const doc = await fetchJson(base + e.file);
    if (doc.record_count !== doc.records.length) throw new Error(`${e.dataset}: record_count не сходится`);
    data[e.dataset] = doc.records;
    meta[e.dataset] = { sha: doc.source_sha256, jsonSha: e.json_sha256, count: doc.record_count };
  }
  return { data, meta };
}

export const browserFetch = (url) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
