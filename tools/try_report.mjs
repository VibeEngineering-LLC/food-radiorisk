// Ручной прогон отчёта на примере: node tools/try_report.mjs [md|html|json]
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario } from '../src/calc/model.js';
import { presetRadGear } from '../src/ui/form.js';
import { buildReport } from '../src/ui/report.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const input = presetRadGear();
const rep = buildReport(process.argv[2] || 'md', { input, result: computeScenario(data, input) }, { datasets: 3, records: 9, sha: 'abcdef0123' }, '2026-10-02T12:34:56.000Z');
process.stdout.write(rep.fileName + '\n' + rep.text);
