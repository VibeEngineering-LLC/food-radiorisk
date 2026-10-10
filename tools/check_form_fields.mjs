import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const imp = (p) => import(pathToFileURL(root + p).href);
const { loadAll } = await imp('src/data/loader.js');
const { computeScenario, listChoices } = await imp('src/calc/model.js');
const S = await imp('src/react/formState.js');
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const choices = listChoices(data);
let base = S.initialRaw(choices, '2026-10-10');
base = S.setField(base, choices, 'product', 'Говядина');
base = S.setField(base, choices, 'measuredForm', 'fresh');
base = { ...base, dietMode: 'own', portionG: '100', timesPerDay: '1', daysPerWeek: '7', weeksPerMonth: '4', monthsPerYear: '12', years: '3' };
base.nuclides = [{ ...S.newNuclide('Cs-137'), measured: '100', unc: '10', sampleDate: '2026-09-01' }];
const VALS = ['', ' ', 'abc', '-1', '0', '1e400', '1e308', '1e10', '1e-400', '1,5', 'NaN', '2026-13-45', '1e13'];
// режим «выпадения»: нуклид задан плотностью загрязнения и записью перехода, а не измеренной активностью продукта
const transferId = S.transferView(base, choices, 0).groups[0].items[0].value;
const depNuclide = { ...base.nuclides[0], source: 'deposition', measured: '', dep: '100', depDate: '2026-08-01', transfer: transferId, transferPicked: true };
const MODES = { base: {}, life: { lifeMode: true, startAge: '10', endAge: '70' }, dried: { measuredForm: 'dried', dryMatter: '20', dryingFactor: '5', dmUser: true, dfUser: true }, conc: { prepMode: 'concentrated', concK: '2' }, fr: { procMode: 'fr', procFr: '0.5' }, dep: { nuclides: [depNuclide] } };
const FIELDS = ['portionG','timesPerDay','daysPerWeek','weeksPerMonth','monthsPerYear','years','eatDate','startAge','endAge','dryMatter','dryingFactor','procFr','concK','rawMass','probeMass','sampleMass'];
const NFIELDS = ['measured','unc','sampleDate','dep','depDate'];
export async function probeFields() {
  const recs = [];
  const run = (label, raw) => {
    if (process.env.FR_TRACE) process.stderr.write(label + '\n'); // отладка: на каком входе зависло или кончилась память
    try {
      const r = computeScenario(data, S.toInput(raw, choices));
      recs.push({ label, ok: r.ok, dose: r.totals?.doseSvTotal ?? null, msg: (r.errors || []).join(' | ') });
    } catch (e) {
      recs.push({ label, ok: false, thrown: e.name + ': ' + e.message });
    }
  };
  for (const [mode, ov] of Object.entries(MODES)) {
    for (const f of FIELDS) for (const v of VALS) run(`${mode}/${f}=${JSON.stringify(v)}`, { ...base, ...ov, [f]: v });
    for (const nf of NFIELDS) for (const v of VALS) {
      const nu = { ...(ov.nuclides || base.nuclides)[0], [nf]: v };
      run(`${mode}/n.${nf}=${JSON.stringify(v)}`, { ...base, ...ov, nuclides: [nu] });
    }
  }
  return recs;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await probeFields();
  if (process.argv.includes('--json')) for (const x of r) console.log(JSON.stringify(x));
  else { // матрица исходов: E — сообщение, D — доза, 0 — доза нуль без сообщения, T — исключение; порядок значений как в VALS
    console.log('значения:', VALS.map((v) => JSON.stringify(v)).join(' '));
    const rows = new Map();
    for (const x of r) { const k = x.label.replace(/=.*$/, ''); rows.set(k, (rows.get(k) || '') + (x.thrown ? 'T' : x.ok ? (x.dose > 0 ? 'D' : '0') : 'E') + ' '); }
    for (const [k, v] of rows) console.log(k.padEnd(22), v);
  }
  console.log(`total ${r.length}`);
}
