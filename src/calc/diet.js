// #FR-83 (D-023): потребление по умолчанию, если реальное неизвестно — выбор группы и значения, проверки для ядра
import { matchProduct } from './products.js';
import { T, fill } from '../ui/texts_v.js';
import { fmtNum } from '../ui/fmt.js';
import { locRu } from '../ui/ru.js';
import SHORT from '../ui/source_short.json' with { type: 'json' };

// D-023 В6: взрослый ряд потребления — с 18 лет; порог групп e(g) МКРЗ (AGE_BANDS, 17 лет) здесь не используется
export const ADULT_FROM_AGE = 18;
export const NONFRESH = ['dried', 'cooked'];

export function isChild({ age, lifetime }) {
  if (age !== 'adult') return true;
  if (lifetime && !(lifetime.fromAge >= ADULT_FROM_AGE)) return true;
  return false;
}

/** #FR-85 (D-024): В1 — значение группы с direction=match есть ряд ровно для основы учёта; изделие (diet.base: false в словаре)
 *  и группа, выбранная пользователем вручную, получают его как оценку сверху */
export const effectiveGroup = (group, base) => (base ? group : { ...group, direction: 'upper' });

/** #FR-85: группа рациона — поле diet.group записи словаря (data.products); продукт не распознан или неоднозначен — группа,
 *  выбранная пользователем (manualGroup), иначе группа «продукт не распознан» (other). Запись словаря без группы — null. */
export function dietPick(recs, productName, products, manualGroup = null, confirmId = null) {
  const groups = (Array.isArray(recs) ? recs : []).filter(r => r.kind === 'group');
  if (groups.length === 0) return { group: null, base: true, manual: false };
  const m = matchProduct(products, productName, confirmId); // #FR-85 v11: «частично» — только после подтверждения пользователем (confirmId)
  if (m.status === 'ok') {
    const code = m.regroup ?? m.entry.diet?.group ?? null; // #FR-85 v14: регруппировка по слову названия («щука покупная»)
    return { group: code ? groups.find(g => g.code === code) || null : null, base: m.entry.diet?.base !== false, manual: false };
  }
  const picked = manualGroup ? groups.find(g => g.code === manualGroup && g.code !== 'other') : null;
  if (picked) return { group: picked, base: false, manual: true };
  return { group: groups.find(g => g.code === 'other') || null, base: true, manual: false };
}
/** группа рациона (запись kind: group) для названия продукта — см. dietPick */
export const dietGroupFor = (recs, productName, products, manualGroup = null, confirmId = null) => dietPick(recs, productName, products, manualGroup, confirmId).group;

export function dietDefaultFor(recs, { productName, state, age, lifetime, mode, products, manualGroup = null, confirmId = null }) {
  const list = Array.isArray(recs) ? recs : [];
  const byId = (id) => list.find(r => r.kind === 'value' && r.id === id) || null;
  const found = dietPick(list, productName, products, manualGroup, confirmId);
  const group = found.group && effectiveGroup(found.group, found.base);
  const manual = found.manual;

  if (!group) {
    return { status: 'not_established', reason: 'no_data', rec: null, base: null, ref614: null, info: null, group: null, missing: null, manual };
  }

  const info = group.info_id ? byId(group.info_id) : null;

  if (isChild({ age, lifetime })) {
    return { status: 'not_established', reason: 'child', rec: null, base: null, ref614: null, info, group, missing: null, manual };
  }

  if (group.status !== 'default') {
    return {
      status: group.status,
      reason: group.status === 'source_required' ? 'source_required' : 'group',
      rec: null,
      base: null,
      ref614: null,
      info,
      group,
      missing: group.missing ?? null,
      manual
    };
  }

  if (NONFRESH.includes(state)) {
    return { status: 'not_established', reason: 'state', rec: null, base: null, ref614: null, info, group, missing: null, manual };
  }

  const base = byId(group.default_id);
  if (!base) {
    return { status: 'not_established', reason: 'no_data', rec: null, base: null, ref614: null, info, group, missing: null, manual };
  }

  const ref614 = group.ref614_id ? byId(group.ref614_id) : null;
  let chosen = base;

  if (mode === 'high') {
    const high = group.high_id ? byId(group.high_id) : null;
    if (!high) {
      return { status: 'not_established', reason: 'high_no_series', rec: null, base, ref614, info, group, missing: null, manual };
    }
    if (high.value < base.value) {
      return { status: 'not_established', reason: 'high_not_set', rec: null, base, ref614, info, group, missing: null, manual };
    }
    chosen = high;
  }

  return { status: 'default', reason: null, rec: chosen, base, ref614, info, group, missing: null, manual };
}

export function dietReasonText(d) {
  switch (d.reason) {
    case 'child': return T.DIET_CHILD;
    case 'state': return T.DIET_STATE;
    case 'source_required': return fill(T.DIET_SOURCE_REQUIRED, { missing: d.missing || '' });
    case 'high_not_set': return T.DIET_HIGH_NOT_SET;
    case 'high_no_series': return T.DIET_HIGH_NO_SERIES;
    default: return T.DIET_NOT_SET;
  }
}

export const seriesLabel = (series) => T.DIET_SERIES[series] || series;
export const shortSource = (code) => SHORT[code] || code;
export const gramsPerDay = (kgPerYear) => Math.round(kgPerYear * 1000 / 365);

export function dietScopeText(group) {
  if (!group || !group.scope_note || group.direction === 'match') return '';
  return fill(T.DIET_SCOPE, { scope: group.scope_note });
}

export function dietWarnText(rec, group) {
  return fill(T.DIET_WARN, {
    value: fmtNum(rec.value),
    label: group ? group.label_ru : '',
    series: seriesLabel(rec.series),
    source: shortSource(rec.source),
    year: rec.year ? `, ${rec.year} г.` : '',
    loc: locRu(rec.loc),
    scope: group && dietScopeText(group) ? ' ' + dietScopeText(group) : ''
  });
}

export function dietSummaryText(rec) {
  return fill(T.DIET_SUMMARY, {
    value: fmtNum(rec.value),
    series: seriesLabel(rec.series),
    year: rec.year ? `, ${rec.year} г.` : ''
  });
}

export function checkDietInput(recs, input, products) {
  const d = input && input.diet;
  if (!d || d.mode === undefined || d.mode === 'own') {
    return { errors: [], rec: null, group: null, blocked: false };
  }

  if (d.mode !== 'default' && d.mode !== 'high') {
    return { errors: [T.DIET_BAD_MODE], rec: null, group: null, blocked: true };
  }

  if (d.reason) {
    return { errors: [dietReasonText(d)], rec: null, group: null, blocked: true };
  }

  const list = Array.isArray(recs) ? recs : [];
  const rec = list.find(r => r.kind === 'value' && r.id === d.id) || null;
  // #FR-83 v8 (Н-3): ядро само выбирает группу и ряд по названию продукта и режиму и сверяет с записью, пришедшей от формы
  const want = dietDefaultFor(list, { productName: input.product?.name, state: input.product?.state, age: input.age, lifetime: input.lifetime, mode: d.mode, products, manualGroup: input.product?.dietGroup ?? null, confirmId: input.product?.confirmId ?? null });
  const group = want.group || list.find(r => r.kind === 'group' && r.code === d.group) || null;
  const errors = [];

  if (want.status !== 'default') {
    if (want.reason !== 'child' && want.reason !== 'state') errors.push(dietReasonText(want)); // ребёнок и состояние — ниже, своими проверками
  } else if (d.group !== want.group.code || (rec && rec.group !== want.group.value_group)) {
    errors.push(T.DIET_GROUP_MISMATCH);
  } else if (rec && rec.id !== want.rec.id) {
    errors.push(T.DIET_ROW_MISMATCH);
  }

  if (!rec) {
    errors.push(fill(T.DIET_NO_REC, { id: d.id }));
  } else {
    const mass = input.portionKg * input.portionsPerYear;
    if (!Number.isFinite(mass) || Math.abs(mass - rec.value) > 1e-9 * rec.value) {
      errors.push(T.DIET_MISMATCH);
    }
  }

  // вторая линия защиты (вызов ядра в обход формы) — своя проверка, не вызов isChild: поломка одной не маскирует другую
  const lt = input.lifetime;
  if (input.age !== 'adult' || (lt && !(lt.fromAge >= ADULT_FROM_AGE))) {
    errors.push(T.DIET_CHILD);
  }

  if (NONFRESH.includes(input.product && input.product.state)) {
    errors.push(T.DIET_STATE);
  }

  return { errors, rec, group, manual: !!want.manual, blocked: errors.length > 0 };
}

/** шаг «рацион» в provenance каждой строки нуклида (формат — как у прочих шагов model.js) */
export function dietProvenance(rec, group) {
  const scope = dietScopeText(group);
  return { step: 'рацион', what: 'потребление по умолчанию', id: rec.id, source: rec.source, loc: rec.loc, level: rec.level, value: rec.value, unit: rec.unit, note: seriesLabel(rec.series) + (scope ? '; ' + scope : '') };
}

/** поле result.diet: копия записи без цитаты и подписи группы — экран и отчёт не ищут её заново */
export function dietResult(mode, rec, group, manual = false) {
  const { quote, ...rest } = rec;
  return { mode, ...rest, label: group ? group.label_ru + (manual ? ' (группа выбрана пользователем)' : '') : '', manual: !!manual, scope_note: group?.scope_note ?? null, direction: group?.direction ?? null };
}
