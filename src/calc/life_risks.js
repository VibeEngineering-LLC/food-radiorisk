// #FR-81 V08 (D-022): вкладка «Бытовые риски»: вероятность умереть от обычных причин за те же N лет, что длится питание, начиная с того же возраста a (causeProb по таблице дожития Росстата и долям причин ВОЗ, src/calc/life_table.js), и строка риска от питания R; исход везде — смерть, без отношений «во сколько раз» и «1 из»
import { makeLifeTable, causeProb, BG_CODE } from './life_table.js';
import { NOMINAL_AGE } from './years.js';

// Порядок строк на вкладке: новообразования (рак), дорожные происшествия, падения, утопления, огонь, случайные отравления (решение В11)
export const DOMESTIC_CODES = [BG_CODE, '1096', '1097', '1098', '1099', '1100'];

// Последний узел таблицы дожития; для конечного b > 85 causeProb бросает RangeError, поэтому срок за пределами 85 лет обрезается (решение исполнителя; в объекте результата флаг capped)
export const LAST_AGE = 85;

export function lifeRisks(result, input, records) {
  try {
    if (!result?.totals || !Array.isArray(records)) return null;

    const R = result.totals.riskNominal;
    if (!Number.isFinite(R)) return null;

    const lt = records.find(r => r.kind === 'life_table');
    if (!lt) return null;

    const a = input.lifetime ? input.lifetime.fromAge : NOMINAL_AGE[input.age];
    if (!Number.isFinite(a) || a >= LAST_AGE) return null;

    const N = result.period?.years;
    if (!Number.isFinite(N) || N <= 0) return null;

    const b = Math.min(a + N, LAST_AGE);
    const capped = a + N > LAST_AGE;

    const table = makeLifeTable(records);

    const rows = [{ id: 'product', kind: 'product', label: null, p: R, code: null }];
    for (const code of DOMESTIC_CODES) {
      const rec = records.find(r => r.kind === 'cause_shares' && r.code === code);
      if (!rec) continue;
      rows.push({ id: 'cs_' + code, kind: 'cause', label: rec.label_ru, p: causeProb(table, code, a, b), code });
    }

    return { a, b, N, n: b - a, capped, year: lt.year, rows };
  } catch {
    return null;
  }
}
