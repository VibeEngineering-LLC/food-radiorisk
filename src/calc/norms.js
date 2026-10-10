/**
 * Нормативные значения ТР ТС 021/2011 Приложение 4.
 * @module src/calc/norms
 */
import { isDryNorm } from './form_norm.js';

/**
 * Нормализация строки: нижний регистр, ё->е, обрезка, схлопывание пробелов.
 * @param {unknown} s - входное значение
 * @returns {string} нормализованная строка
 */
export const normText = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');

/** Префикс идентификаторов записей Приложения 4. */
export const P4_PREFIX = 't021_p4_';

/**
 * Проверка, является ли запись записью Приложения 4.
 * @param {object} rec - запись
 * @returns {boolean} результат проверки
 */
export const isP4 = (rec) => String(rec?.id ?? '').startsWith(P4_PREFIX);

/** Префикс записей ТР ЕАЭС 044/2017 табл. 4 (питьевая вода; Прил. 4 ТР ТС 021 отсылает воду к 044, #FR-81 P2-1). */
export const T044_PREFIX = 't044_water_';

/** Запись, входящая в показатель B: Прил. 4 ТР ТС 021 либо (только для воды) табл. 4 ТР ЕАЭС 044. */
export const isBNorm = (rec) => isP4(rec) || (rec?.food_group_code === 'water' && String(rec?.id ?? '').startsWith(T044_PREFIX));

/** Группы, где в одной группе несколько пунктов Прил. 4 (молочные продукты п. 6–10, масла п. 11, 20–22): пункт задаёт словарь продуктов (#FR-85). */
export const MULTI_POINT_GROUPS = ['milk_products', 'fats_oils'];

/**
 * Выбор нормативной записи из таблицы ограничений.
 * #FR-85: строку норматива выбирает словарь продуктов (normId — id строки Cs-137 записи словаря для состояния, products.js normIdFor),
 * а не разбор названия; normId не из этой группы (группа выбрана вручную) или его нет — самая строгая из пунктов группы с предупреждением.
 * @param {Array} limitsRu - массив записей
 * @param {string} code - код группы
 * @param {string} nuclide - нуклид
 * @param {string|null} normId - id строки норматива из словаря (для нуклида — normIdFor(entry, state, nuclide))
 * @param {string} state - состояние продукта
 * @param {{activity: number, K: number|null}|null} [dryCtx] - #FR-88 v20 (D-029, V-2): активность сушёного продукта и K — для выбора строки по наибольшему показателю B после пересчёта на K
 * @returns {{rec: object|null, ambiguous: boolean, needsK?: boolean}} результат выбора
 */
export function pickNormRecord(limitsRu, code, nuclide, normId, state, dryCtx = null) {
  const candidates = limitsRu.filter(
    (r) => isBNorm(r) && r.food_group_code === code && r.nuclide === nuclide && Number.isFinite(r.value) && r.value > 0
  );
  if (!candidates.length) return { rec: null, ambiguous: false };

  const found = normId ? candidates.find((r) => r.id === normId) : null;
  if (found) return { rec: found, ambiguous: false };
  // #FR-85 v11: строка словаря — другого регламента в этой же группе (ТР ТС 015, зерно: кукуруза в группе «крупы») — в B не входит, пункт Прил. 4 не подставляется
  if (normId && limitsRu.some((r) => r.id === normId && r.food_group_code === code && !isBNorm(r))) return { rec: null, ambiguous: false };

  if (MULTI_POINT_GROUPS.includes(code)) {
    // #FR-88 v19 (D-029, Q4): самая строгая; при равных значениях — меньший номер пункта Прил. 4 (loc «Прил. 4, п. N»), далее — первая в данных
    const pointNo = (r) => Number((String(r.loc ?? '').match(/п\.\s*(\d+)/) || [])[1]) || Infinity;
    const strictest = candidates.reduce((a, b) => (b.value < a.value || (b.value === a.value && pointNo(b) < pointNo(a)) ? b : a));
    // #FR-88 v20 (D-029, V-2): сушёный продукт при ручной группе — строгость сравнивается ПОСЛЕ пересчёта на K (строка с большим B); K не задан — выбор невозможен, вердикта нет (needsK)
    if (state === 'dried' && dryCtx) {
      const K = dryCtx.K;
      if (!(Number.isFinite(K) && K >= 1)) return { rec: strictest, ambiguous: candidates.length > 1, needsK: true };
      const bOf = (r) => (isDryNorm(r) ? dryCtx.activity : dryCtx.activity / K) / r.value;
      const top = candidates.reduce((a, b) => (bOf(b) > bOf(a) || (bOf(b) === bOf(a) && pointNo(b) < pointNo(a)) ? b : a));
      return { rec: top, ambiguous: candidates.length > 1, needsK: true };
    }
    return { rec: strictest, ambiguous: candidates.length > 1 };
  }

  const dryRe = /сух/i;
  const rec = state === 'dried'
    ? candidates.find((r) => dryRe.test(r.food_group_ru)) || candidates[0]
    : candidates.find((r) => !dryRe.test(r.food_group_ru)) || candidates[0];

  return { rec, ambiguous: false };
}

/** Подписи групп. */
export const GROUP_LABELS = {
  milk_products: 'Молочные продукты, кроме молока (Прил. 4, п. 6–10: сыры, масло, сгущённые, сухие, белковые концентраты)',
  fats_oils: 'Масла, жиры, спреды, маргарины, майонез (Прил. 4, п. 11, 20–22)',
};

/**
 * Получение подписи группы.
 * @param {string} code - код группы
 * @param {Array} limitsRu - массив записей
 * @returns {string} подпись группы
 */
export function groupLabel(code, limitsRu) {
  if (GROUP_LABELS[code]) return GROUP_LABELS[code];
  const groupRecs = limitsRu.filter((r) => r.food_group_code === code);
  const p4Recs = groupRecs.filter(isP4);
  const rec = p4Recs.find((r) => !r.food_group_ru.includes('значение в скобках')) || p4Recs[0] || groupRecs[0];
  return rec?.food_group_ru || '';
}
