// #FR-83 W07/W09: строки блока «Рацион» по результату выбора умолчания (тексты — только из texts_v.json через T/fill)
import { T, fill } from './texts_v.js';
import { fmtNum } from './fmt.js';
import { gramsPerDay, dietScopeText, dietReasonText, seriesLabel, shortSource } from '../calc/diet.js';

export function dietLines(pick, recs, mode) {
  if (!pick) {
    return { line: null, scope: null, basis: null, ref614: null, diff: null, info: null, notSet: null, child: null };
  }

  const valueRec = (id) => (recs || []).find(r => r.kind === 'value' && r.id === id) || null;
  const yearText = (r) => r.year ? `, ${r.year} г.` : '';

  const infoLine = (p) => {
    if (p.info && p.group && p.group.info_label) {
      return fill(T.DIET_INFO_LINE, {
        label: p.group.info_label,
        value: fmtNum(p.info.value),
        unit: T.DIET_UNITS[p.info.unit] || p.info.unit,
        series: seriesLabel(p.info.series) + yearText(p.info)
      });
    }
    return null;
  };

  if (pick.status === 'default') {
    const rec = pick.rec;
    const value = fmtNum(rec.value);
    const gday = gramsPerDay(rec.value);

    let line;
    if (rec.series === 'method_estimate') {
      line = fill(T.DIET_MUSHROOM_LINE, { value, gday, source: shortSource(rec.source), population: rec.population, basis: rec.basis });
    } else if (rec.series === 'high_d10') {
      line = fill(T.DIET_HIGH_LINE, { value, gday, label: pick.group.label_ru, year: rec.year });
    } else {
      line = fill(T.DIET_DEFAULT_LINE, { value, gday, label: pick.group.label_ru, year: rec.year });
    }

    const scope = dietScopeText(pick.group) || null;
    const basis = rec.series === 'method_estimate' ? null : fill(T.DIET_BASIS, { basis: pick.base.basis });
    const ref614 = pick.ref614 ? fill(T.DIET_REF614, { value: fmtNum(pick.ref614.value) }) : null;

    let diff = null;
    const high = pick.group.high_id ? valueRec(pick.group.high_id) : null;
    if (high && pick.base.series === 'balance') {
      diff = fill(T.DIET_SERIES_DIFF, { balance: fmtNum(pick.base.value), high: fmtNum(high.value) });
    }

    return {
      line,
      scope,
      basis,
      ref614,
      diff,
      info: infoLine(pick),
      notSet: null,
      child: null
    };
  }

  // Статус не 'default'
  const notSet = dietReasonText({ reason: pick.reason, missing: pick.missing });
  const info = infoLine(pick);

  let child = null;
  if (pick.reason === 'child') {
    const rows = Object.entries(T.DIET_CHILD_ROWS).map(([group, label]) => {
      const getVal = (age) => {
        const r = (recs || []).find(x => x.kind === 'value' && x.series === 'child_ref' && x.group === group && x.age === age);
        return r ? fmtNum(r.value) : '';
      };
      return {
        label,
        v1: getVal('1y'),
        v10: getVal('10y')
      };
    });

    child = {
      head: T.DIET_CHILD_HEAD,
      note: T.DIET_CHILD_NOTE,
      cols: T.DIET_CHILD_COLS,
      rows
    };
  }

  return {
    line: null,
    scope: null,
    basis: null,
    ref614: null,
    diff: null,
    info,
    notSet,
    child
  };
}
