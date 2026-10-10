// #FR-81 V06: вероятность умереть от причины за отрезок возраста [a, b) по таблице дожития Росстата и долям причин ВОЗ (набор data-src/life_risks.yaml, записи life_table и cause_shares). Формула: P = Σ_g доля_g · [l(max(g0,a)) − l(min(g1,b))] / l(a); l между узлами — линейная интерполяция (допущение, решение заказчика D-022); оба пола — с весами по числу родившихся.

/** код ВОЗ «новообразования (рак и другие опухоли, C00–D48)»: фон главного экрана (V07) и строка рака вкладки бытовых рисков (V08); кода только злокачественных нет (Д1) */
export const BG_CODE = '1026';

export const makeLifeTable =(records) => {
  const lt = records.find(r => r.kind === 'life_table');
  if (!lt) throw new Error('life_table: запись не найдена');
  const cs = records.filter(r => r.kind === 'cause_shares');
  const shares = {};
  for (const r of cs) {
    shares[r.code] = {
      male: r.share.male,
      female: r.share.female
    };
  }
  const wMale = lt.births.male / (lt.births.male + lt.births.female);
  return {
    nodes: lt.nodes,
    lx: lt.lx,
    wMale,
    groups: lt.groups,
    shares
  };
};

export const lxAt = (table, sex, x) => {
  if (typeof x !== 'number' || Number.isNaN(x) || x < 0) {
    throw new RangeError('некорректный возраст');
  }
  if (x === Infinity) return 0;
  const nodes = table.nodes;
  const lx = table.lx[sex];
  const n = nodes.length;
  if (x > nodes[n - 1]) {
    throw new RangeError('возраст выше последнего узла таблицы');
  }
  if (x === nodes[0]) return lx[0];
  if (x === nodes[n - 1]) return lx[n - 1];
  let i = 0;
  while (i < n - 1 && nodes[i + 1] < x) i++;
  const x0 = nodes[i];
  const x1 = nodes[i + 1];
  const y0 = lx[i];
  const y1 = lx[i + 1];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
};

export const causeProb = (table, code, a, b, who = 'both') => {
  const t = Array.isArray(table) ? makeLifeTable(table) : table;
  if (!t.shares[code]) {
    throw new Error(`нет долей причин для кода ${code}`);
  }
  if (typeof a !== 'number' || !Number.isFinite(a) || a < 0 || a > t.nodes[t.nodes.length - 1]) {
    throw new RangeError('некорректный нижний предел возраста');
  }
  if (typeof b !== 'number' && b !== Infinity) {
    throw new RangeError('некорректный верхний предел возраста');
  }
  if (b < a) {
    throw new RangeError('верхний предел меньше нижнего');
  }
  if (b !== Infinity && b > t.nodes[t.nodes.length - 1]) {
    throw new RangeError('верхний предел выше последнего узла таблицы');
  }
  if (b === a) return 0;

  const sexes = who === 'both'
    ? [['male', t.wMale], ['female', 1 - t.wMale]]
    : [[who, 1]];

  let den = 0;
  let num = 0;

  for (const [s, w] of sexes) {
    den += w * lxAt(t, s, a);
    for (let i = 0; i < t.groups.length; i++) {
      const [g0, g1] = t.groups[i];
      const lo = Math.max(g0, a);
      const hi = Math.min(g1 === null ? Infinity : g1, b);
      if (hi > lo) {
        num += w * t.shares[code][s][i] * (lxAt(t, s, lo) - lxAt(t, s, hi));
      }
    }
  }

  return den === 0 ? 0 : num / den;
};
