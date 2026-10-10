import { causeProb } from './life_table.js';

export const SHOWN_CODES = ['1026', '1064', '1096', '1097', '1098', '1099', '1100', '1101', '1102']; // непересекающиеся причины: рак, кровообращение, ДТП, падения, утопления, огонь, отравления, самоубийства, убийства
export const TOTAL_CODE = '1000';          // все причины (справочно)
export const REF_CODES = ['1034', '1095']; // справочные: рак лёгкого (часть 1026), внешние причины всего (включают 1096–1102 и прочее)

export function lifetimeRows(records, table, a, b, productP) {
  // словарь меток по коду из записей cause_shares
  const labelMap = new Map();
  for (const r of records) {
    if (r && r.kind === 'cause_shares' && r.code != null) {
      labelMap.set(String(r.code), r.label_ru ?? null);
    }
  }
  const label = (code) => (labelMap.has(String(code)) ? labelMap.get(String(code)) : null);
  const has = (code) => labelMap.has(String(code));

  const rows = [];
  // номинальный риск из продукта (R) — не причина смерти, не входит в shownSum
  if (typeof productP === 'number' && Number.isFinite(productP)) {
    rows.push({ id: 'product', kind: 'product', label: null, p: productP, code: null });
  }

  // показанные причины
  let shownSum = 0;
  for (const code of SHOWN_CODES) {
    if (!has(code)) continue;
    const p = causeProb(table, code, a, b);
    rows.push({ id: 'cs_' + code, kind: 'cause', label: label(code), p, code });
    shownSum += p;
  }

  // общая сумма по всем причинам (код 1000)
  const total = has(TOTAL_CODE) ? causeProb(table, TOTAL_CODE, a, b) : null;

  // прочие причины = 1000 минус показанные; без clamp, отрицательное значение сохраняется
  if (total !== null) {
    rows.push({
      id: 'cs_other',
      kind: 'other',
      label: 'Прочие причины смерти (все остальные: код ВОЗ 1000 минус показанные)',
      p: total - shownSum,
      code: null,
    });
  }

  // справочные строки
  const refs = [];
  if (total !== null) {
    refs.push({ id: 'ref_1000', kind: 'total', label: 'Все причины смерти (код ВОЗ 1000)', p: total, code: '1000' });
  }
  for (const code of REF_CODES) {
    if (!has(code)) continue;
    refs.push({
      id: 'ref_' + code,
      kind: 'ref',
      label: label(code),
      p: causeProb(table, code, a, b),
      code,
      within: code === '1034' ? 'cs_1026' : null,
    });
  }

  return {
    rows,
    refs,
    total,
    shownSum,
    otherNegative: total !== null && (total - shownSum) < -1e-12,
  };
}
