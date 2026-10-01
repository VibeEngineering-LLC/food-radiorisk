// #FR-48: несколько способов обработки. Поэтапные Fr (каждый — к продукту после предыдущего шага) перемножаются;
// накопленные (cumulative: true — уже отсчитаны от сырья) друг с другом не перемножаются: берётся наибольшее (консервативно для дозы).
export function combineFr(items) {
  const cum = items.filter(i => i.rec.cumulative === true);
  const staged = items.filter(i => i.rec.cumulative !== true);
  const cumFr = cum.length ? Math.max(...cum.map(i => i.value)) : 1;
  return { fr: staged.reduce((p, i) => p * i.value, cumFr), cumulativeCount: cum.length, stagedCount: staged.length };
}

export function resolveProcessing(records, processing, prov, warn) {
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
        throw new Error(`нет записи обработки ${id}`);
      }

      if (pRec.quantity !== 'Fr') {
        throw new Error('запись не Fr — выбрать Fr; Pf/кратность в модель не подставляются');
      }

      let key = processing.variant === 'best' ? 'value_best' : processing.variant === 'min' ? 'value_min' : 'value_max';

      if (key === 'value_best' && pRec.value_best == null && pRec.value_max != null) {
        key = 'value_max';
        warn(`обработка ${pRec.id}: рекомендованного значения нет — взят максимум диапазона Fr = ${pRec.value_max}`);
      }

      if (pRec[key] == null) {
        throw new Error(`нет значения ${key}`);
      }

      items.push({ rec: pRec, value: pRec[key] });

      prov.push({
        step: 'обработка',
        what: pRec.process_ru,
        id: pRec.id,
        source: pRec.source,
        loc: pRec.loc,
        level: pRec.level,
        value: pRec[key],
        unit: ''
      });

      if (pRec.level !== '✅' || pRec.source_anomaly) {
        warn(`обработка ${pRec.id}: уровень проверки ${pRec.level}${pRec.source_anomaly ? ', аномалия источника' : ''}`);
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

    const comb = combineFr(items);

    if (items.length > 1) {
      warn(`обработка: выбрано способов — ${items.length}; общий Fr = ${comb.fr.toPrecision(3)}. Поэтапные Fr перемножены (каждый считается относительно продукта после предыдущего шага)${comb.cumulativeCount > 1 ? `; ${comb.cumulativeCount} значений уже отсчитаны от сырья и друг с другом не перемножаются — взято наибольшее` : ''}`);
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
