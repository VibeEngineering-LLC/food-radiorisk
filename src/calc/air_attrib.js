import { causeProb } from './life_table.js';

// Группы атрибуции смертей загрязнению воздуха: каждая группа — подсектор
// внутри родительской причины; доли переносим на горизонт [a, b] через causeProb.
export const AIR_GROUPS = [
  { id: 'air_circ', parent: 'cs_1064', parts: ['air_ihd', 'air_stroke'], label: 'в т. ч. от загрязнения воздуха (ишемическая болезнь сердца и инсульт)', hint: 'доли смертей причины, приписанные загрязнению воздуха (Health Effects Institute, HEI, Россия, 2017; оценки Global Burden of Disease 2017, GBD 2017), перенесены на срок диаграммы пропорционально вероятности умереть от причины — допущение' },
  { id: 'air_lung', parent: 'cs_1026', parts: ['air_lung'], label: 'в т. ч. рак лёгкого от загрязнения воздуха', hint: 'доля смертей от рака лёгкого, приписанная загрязнению воздуха (HEI, Россия, 2017; GBD 2017), перенесена на срок диаграммы пропорционально — допущение; вклады воздуха, радона и курения перекрываются' },
  { id: 'air_copd', parent: 'cs_other', parts: ['air_copd'], label: 'в т. ч. хроническая обструктивная болезнь лёгких (ХОБЛ) от загрязнения воздуха (входит в «Прочие причины смерти»)', hint: 'доля смертей от хронических болезней нижних дыхательных путей (J40–J47, в т. ч. ХОБЛ), приписанная загрязнению воздуха (HEI, Россия, 2017; GBD 2017), перенесена на срок диаграммы пропорционально — допущение' },
];

// Собирает подсекторы «в т. ч. от загрязнения воздуха» для диаграммы [a, b].
// Возвращает объект с метаданными набора и массивом групп, либо null.
export function airAttrib(records, table, a, b) {
  try {
    // records обязан быть массивом
    if (!Array.isArray(records)) return null;

    // Отбираем записи атрибуции воздуха для России
    const recs = records.filter(r => r && r.kind === 'air_attrib' && r.region === 'ru');
    if (recs.length === 0) return null;

    // Быстрый поиск записей cause_shares по code
    const causeSharesByCode = new Map();
    for (const r of records) {
      if (r && r.kind === 'cause_shares' && typeof r.code === 'string') {
        causeSharesByCode.set(r.code, r);
      }
    }

    const groups = [];

    for (const g of AIR_GROUPS) {
      const parts = [];
      for (const partId of g.parts) {
        // Ищем запись air_attrib по id
        const rec = recs.find(r => r.id === partId);
        if (!rec) continue;
        if (typeof rec.code !== 'string') continue;
        // Проверяем наличие cause_shares с тем же code
        if (!causeSharesByCode.has(rec.code)) continue;

        // Вычисляем вероятность на горизонте [a, b]
        const prob = causeProb(table, rec.code, a, b);
        const p = rec.value * prob;

        parts.push({
          id: partId,
          code: rec.code,
          share: rec.value,
          p,
          label: rec.label_ru,
        });
      }

      // Группа без частей пропускается
      if (parts.length === 0) continue;

      const pSum = parts.reduce((s, x) => s + x.p, 0);
      groups.push({
        id: g.id,
        parent: g.parent,
        label: g.label,
        hint: `${g.hint}. Доли из данных: ${parts.map(x => `${x.label} — ${Math.round(x.share * 100)} %`).join('; ')}`, // числа — из записей набора, не из кода
        parts,
        p: pSum,
      });
    }

    if (groups.length === 0) return null;

    return {
      region: 'ru',
      year: recs[0].year,
      source: recs[0].source,
      level: recs[0].level,
      groups,
    };
  } catch (e) {
    // Любая ошибка (в т. ч. из causeProb) — возвращаем null
    return null;
  }
}
