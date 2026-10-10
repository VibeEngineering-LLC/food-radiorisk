// #FR-48: несколько способов обработки. Поэтапные Fr (каждый — к продукту после предыдущего шага) перемножаются;
// накопленные (cumulative: true — уже отсчитаны от сырья) друг с другом не перемножаются: берётся наибольшее (консервативно для дозы).
// Название записи для сообщений: «продукт — способ», а не служебный id
// #FR-88 v22 (D-4): название продукта записи — русское, как в списке формы (food_ru.json), а не английское из источника
import FOOD_RU from '../ui/food_ru.json' with { type: 'json' };
const procName = (r) => [FOOD_RU[r.food] ?? r.food, r.process_ru].filter(Boolean).join(' — ') || r.id;

export function combineFr(items) {
  const cum = items.filter(i => i.rec.cumulative === true);
  const staged = items.filter(i => i.rec.cumulative !== true);
  // #FR-88 v19 (D-029, Q2): накопленные значения (от сырья) с остальными не перемножаются — общий Fr = наибольший из применимых; перемножаются только поэтапные между собой
  const stagedFr = staged.length ? staged.reduce((p, i) => p * i.value, 1) : null;
  const fr = cum.length ? Math.max(...cum.map(i => i.value), ...(stagedFr === null ? [] : [stagedFr])) : (stagedFr ?? 1);
  return { fr, cumulativeCount: cum.length, stagedCount: staged.length };
}

/** #FR-81 V4-2: запись дана «для радионуклидов вообще» (nuclide — слова, а не символ: «радионуклиды (не уточнено)», «радиоактивные вещества (нуклид не указан)») — как отбор в списке способов (ui/form.js processingOptions) */
export const isGenericNuclide = (rec) => typeof rec.nuclide === 'string' && !/^[A-Za-z]/.test(rec.nuclide);

export function resolveProcessing(records, processing, prov, warn, nuclide = null) {
  let frUsed = 1;

  if (processing.mode === 'fr') {
    if (!Number.isFinite(processing.fr) || processing.fr < 0 || processing.fr > 1) {
      throw new Error('Fr некорректен');
    }
    return processing.fr;
  }

  if (processing.mode === 'record') {
    const ids = processing.recordIds?.length ? processing.recordIds : [processing.recordId];
    const items = [];

    for (const id of ids) {
      const pRec = records.find(r => r.id === id);
      if (!pRec) {
        // #FR-88 v22 (D-3): запись не выбрана — понятное сообщение, не «null»
        if (id == null || id === '') throw new Error('способ обработки «из справочника»: не выбрана запись — отметьте запись в списке или выберите «без обработки (Fr = 1)»');
        throw new Error(`в справочнике нет записи обработки «${id}»`);
      }

      if (pRec.quantity !== 'Fr') {
        throw new Error('запись не Fr — выбрать Fr; Pf/кратность в модель не подставляются');
      }

      // #FR-88 v19 (D-029, Q1): запись «радионуклиды (не уточнено)» к конкретному нуклиду не применяется — Fr = 1 и сообщение
      if (nuclide && isGenericNuclide(pRec)) {
        warn(`обработка «${procName(pRec)}»: коэффициент перехода для ${nuclide} не установлен (в источнике ${pRec.source}, ${pRec.loc} значение дано для радионуклидов вообще) — Fr = 1`);
        continue;
      }

      // #FR-81 V4-3: у записи без рекомендованного и без разброса «минимум/максимум» — то же единственное значение источника; ведём его как «рекомендованное» с тем же предупреждением (форма так и делает, effectiveRaw, но вызов ядра напрямую не должен молчать)
      const noSpread = pRec.value_best == null && pRec.value_max != null && (pRec.value_min == null || pRec.value_min === pRec.value_max);
      // #FR-88 v19 (D-029, Q3): пользователь сам выбрал «минимум/максимум» — предупреждение «рекомендованного нет» не выдаётся
      // #FR-88 v20 (D-029, А-1): явный выбор — и тот, что форма сбросила в «рекомендованное» (у записи нет разброса, вариант не предлагается): processing.askedVariant
      const asked = processing.askedVariant ?? processing.variant;
      const explicitPick = (asked === 'min' || asked === 'max') && noSpread;
      const variant = explicitPick ? 'best' : processing.variant;      let key = variant === 'best' ? 'value_best' : variant === 'min' ? 'value_min' : 'value_max';

      let frVal = pRec[key];
      if (key === 'value_best' && pRec.value_best == null && pRec.value_max != null) {
        // #FR-81 (оператор 05.10, D-021): рекомендованного нет — середина диапазона; максимум — отдельный вариант «скрининг»
        if (pRec.value_min != null && pRec.value_min !== pRec.value_max) {
          frVal = (pRec.value_min + pRec.value_max) / 2;
          warn(`обработка «${procName(pRec)}»: рекомендованного значения нет — взята середина диапазона Fr = ${frVal} (от ${pRec.value_min} до ${pRec.value_max}); максимум диапазона — вариант «скрининг»`);
        } else {
          frVal = pRec.value_max;
          if (!explicitPick) warn(`обработка «${procName(pRec)}»: в источнике одно значение Fr = ${pRec.value_max} (рекомендованного нет) — оно и взято`);
        }
        key = 'value_max';
      } else if (key === 'value_max' && pRec.value_min != null && pRec.value_min !== pRec.value_max) {
        warn(`обработка «${procName(pRec)}»: вариант «скрининг» — максимум диапазона Fr = ${pRec.value_max}, консервативная верхняя оценка`);
      }

      if (pRec[key] == null && key === 'value_best' && pRec.value_min != null) {
        // #FR-81 P2-6: граница есть, но «рекомендованного» нет; нижнюю границу молча не берём (она занижает дозу)
        throw new Error(`для обработки «${procName(pRec)}» в источнике указана только нижняя граница Fr = ${pRec.value_min}, рекомендованного значения нет — выберите вариант «минимум»`);
      }
      if (pRec[key] == null) {
        // #FR-81 D06b: без имени поля данных
        throw new Error(`для обработки «${procName(pRec)}» в источнике нет значения Fr: ни рекомендованного, ни границ диапазона`);
      }

      items.push({ rec: pRec, value: frVal });

      prov.push({
        step: 'обработка',
        what: pRec.process_ru,
        id: pRec.id,
        source: pRec.source,
        loc: pRec.loc,
        level: pRec.level,
        value: frVal,
        unit: ''
      });

      if (pRec.level !== '✅' || pRec.source_anomaly) {
        warn(`обработка «${procName(pRec)}»: уровень проверки ${pRec.level}${pRec.source_anomaly ? ', аномалия источника' : ''}`);
        prov.push({
          step: 'обработка',
          what: pRec.process_ru,
          id: pRec.id,
          source: pRec.source,
          loc: pRec.loc,
          level: pRec.level,
          value: null,
          unit: null,
          note: pRec.source_anomaly || 'уровень не ✅'
        });
      }
    }

    if (!items.length) return 1; // #FR-88 v19 (Q1): ни одна запись к нуклиду не применима
    const comb = combineFr(items);

    if (items.length > 1) {
      warn(`обработка: выбрано способов — ${items.length}; общий Fr = ${comb.fr.toPrecision(3)}. ${comb.cumulativeCount ? `Значения, уже отсчитанные от сырья (${comb.cumulativeCount}), не перемножаются ни друг с другом, ни с поэтапными — взято наибольшее` : 'Поэтапные Fr перемножены (каждый считается относительно продукта после предыдущего шага)'}`);
      prov.push({
        step: 'обработка',
        what: 'общий Fr по нескольким способам',
        value: comb.fr,
        unit: ''
      });
    }

    return comb.fr;
  }

  return 1;
}

/**
 * #FR-81 D06c: какие варианты значения Fr имеет смысл предлагать для выбранных записей.
 * «минимум/максимум диапазона» — только если у какой-то записи есть диапазон из двух разных значений.
 * @param {Array<{value_min?: number|null, value_max?: number|null}>} recs
 */
export function variantOffers(recs) {
  const ranged = recs.some(r => r.value_min != null && r.value_max != null && r.value_min !== r.value_max);
  // #FR-81 P2-6: запись только с нижней границей — «минимум» единственный способ её взять
  const onlyMin = recs.some(r => r.value_min != null && r.value_max == null);
  return { min: ranged || onlyMin, max: ranged };
}
