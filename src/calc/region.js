// #FR-101 (D-031): регион данных — «Мир» (по умолчанию) или «Россия»; статистика разных регионов не смешивается.

export const REGIONS = ['world', 'ru'];
export const DEFAULT_REGION = 'world';
export const REGION_NAME = { world: 'Мир', ru: 'Россия' };

// Подписи к диаграммам и таблицам: регион и год данных
export const CAPTION = {
  world: {
    dose: 'Мир: природный фон — НКДАР ООН 2026, медицина — НКДАР ООН 2020/2021',
    risk: 'Мир: таблица дожития ООН (WPP 2024) и доли причин ВОЗ (GHE 2023), 2019 г.',
  },
  ru: {
    dose: 'Россия, 2020 г.: Барковский и др. 2021 (структура медицины — 2017 г., Онищенко и др. 2019)',
    risk: 'Россия: таблица дожития Росстата и доли причин ВОЗ (база смертности), 2019 г.',
  },
};

export function normRegion(r) {
  return REGIONS.includes(r) ? r : DEFAULT_REGION;
}

export function recordsFor(records, region) {
  if (!Array.isArray(records)) return [];
  const target = normRegion(region);
  return records.filter((r) => {
    if (typeof r !== 'object' || r === null) return false;
    if (r.superseded === true) return false;
    if (r.region === undefined || r.region === null) return true;
    return r.region === target;
  });
}

export function roleRecs(records, role) {
  if (!Array.isArray(records)) return [];
  return records.filter((r) => r && r.role === role && Number.isFinite(r.value));
}

export function roleOne(records, role) {
  const recs = roleRecs(records, role);
  return recs.length > 0 ? recs[0] : null;
}

export function roleSum(records, role) {
  const recs = roleRecs(records, role);
  if (recs.length === 0) return null;
  const first = recs[0];
  return {
    value: recs.reduce((sum, r) => sum + r.value, 0),
    source: first.source,
    loc: first.loc,
    ids: recs.map((r) => r.id),
    n: recs.length,
  };
}

export function regionLeak(records, region) {
  if (!Array.isArray(records)) return [];
  const target = normRegion(region);
  return records.filter((r) => {
    if (typeof r !== 'object' || r === null) return false;
    if (r.superseded === true) return false;
    if (r.region === undefined || r.region === null) return false;
    return r.region !== target;
  });
}
