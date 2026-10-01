import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../src/calc/core.js';

const __filename = fileURLToPath(import.meta.url);
const scenariosUrl = new URL('../tests/fixtures/recount_scenarios.json', import.meta.url);
const S = JSON.parse(readFileSync(scenariosUrl, 'utf8'));
const out = process.argv[2] || fileURLToPath(new URL('../audit/recount-js.json', import.meta.url));
mkdirSync(dirname(out), { recursive: true });

const R = {};
for (const [key, items] of Object.entries(S)) {
  R[key] = items.map(s => {
    try {
      if (key === 'dose') {
        const intake = C.annualIntakeBq({ activityBqPerKg: s.activity, portionKg: s.portionKg, portionsPerYear: s.portionsPerYear, fr: s.fr });
        const dose = C.committedDoseSv(intake, s.e);
        const risk = C.riskFromDose(dose, s.r);
        const pgp = C.pgpFromDose(1e-3, s.e);
        const mm = C.maxMassKg(pgp, s.activity, s.fr);
        return { id: s.id, intake, dose, risk, pgp, maxMass: Number.isFinite(mm) ? mm : null };
      }
      if (key === 'compliance') {
        const c = C.complianceB(s.items);
        return { id: s.id, B: c.B, dB: c.dB, verdict: c.verdict, precisionOk: c.precisionOk };
      }
      if (key === 'soil') {
        const soil = C.soilActivityBqPerKg(s.deposition, s.rho, s.depth);
        const plantDry = C.productFromSoil(soil, s.fv);
        const plantFresh = C.dryToFresh(plantDry, s.dryMatter);
        return { id: s.id, soil, plantDry, plantFresh };
      }
      if (key === 'tag') return { id: s.id, product: C.productFromDeposition(s.deposition, s.tag) };
      if (key === 'decay') return { id: s.id, A_t: s.A * C.decayFactor(s.T, s.dt) };
    } catch (e) {
      return { id: s.id, error: String(e) };
    }
  });
}

writeFileSync(out, JSON.stringify(R, null, 1) + "\n", 'utf8');
const counts = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.length]));
console.log(JSON.stringify({ ok: true, counts }));
