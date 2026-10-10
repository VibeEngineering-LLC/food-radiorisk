// #FR-85 (D-024): продукт определяется словарём data-src/products.yaml (src/calc/products.js); основы слов, исключения и стоп-слова удалены.
import { pickNormRecord } from './norms.js';
import { normIdFor } from './products.js';

/**
 * Нормализация строки: нижний регистр, замена «ё» на «е»,
 * удаление пробелов по краям и схлопывание внутренних пробелов.
 * @param {unknown} s - произвольное значение.
 * @returns {string} нормализованная строка.
 */
export function normRu(s) {
  return String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

/**
 * Возвращает код пищевой группы (food_group_code) из таблицы limitsRu,
 * соответствующий нормативу для данного продукта и состояния.
 * @param {Array} limitsRu - массив записей нормативов.
 * @param {object|null} entry - запись продукта или null.
 * @param {string} state - состояние продукта ('fresh', 'dried', 'cooked' или пустая строка).
 * @returns {string|null} код пищевой группы или null, если запись не найдена.
 */
export function normCodeFor(limitsRu, entry, state) {
  if (!entry) return null;
  const id = normIdFor(entry, state === 'dried' ? 'dried' : 'fresh');
  if (!id) return null;
  const rec = limitsRu.find(r => r.id === id);
  return rec ? rec.food_group_code : null;
}

/**
 * Возвращает запись норматива для заданного кода, нуклида и состояния.
 * @param {Array} limitsRu - массив записей нормативов.
 * @param {string} code - код пищевой группы.
 * @param {string} nuclide - название нуклида.
 * @param {string} state - состояние продукта.
 * @param {string|null} [normId=null] - идентификатор норматива.
 * @returns {object|null} запись норматива или null.
 */
export function limitRecordFor(limitsRu, code, nuclide, state, normId = null) {
  return pickNormRecord(limitsRu, code, nuclide, normId, state).rec;
}

/**
 * Вычисляет коэффициент концентрирования при сушке (fresh -> dried).
 * @param {Array} limitsRu - массив записей нормативов.
 * @param {object|null} entry - запись продукта или null.
 * @returns {object|null} объект с коэффициентом и значениями или null.
 */
export function dryingFactorFor(limitsRu, entry) {
  if (!entry) return null;
  const f = limitsRu.find(r => r.id === entry.norm.fresh);
  const d = limitsRu.find(r => r.id === entry.norm.dried);
  if (!f || !d || f.id === d.id || !(d.value > f.value)) return null;
  return { value: d.value / f.value, fresh: f.value, dried: d.value, document: d.document };
}

/**
 * Возвращает данные о сухом веществе для продукта.
 * @param {Array|undefined} dmRecords - массив записей о сухом веществе.
 * @param {object|null} entry - запись продукта или null.
 * @returns {object|null} объект с данными о сухом веществе или null.
 */
export function dryMatterFor(dmRecords, entry) {
  if (!entry || !entry.dry_matter) return null;
  const arr = dmRecords || [];
  const match = arr.find(r => r.id === entry.dry_matter && r.quantity === 'dry_matter' && (isFinite(r.am) || isFinite(r.gm)));
  if (!match) return null;
  return {
    value: isFinite(match.am) ? match.am : match.gm,
    min: isFinite(match.min) ? match.min : null,
    max: isFinite(match.max) ? match.max : null,
    id: match.id,
    source: match.source,
    level: match.level,
    item: match.item_ru
  };
}

/**
 * Проверяет, соответствует ли запись норматива способу обработки продукта.
 * @param {object} rec - запись норматива.
 * @param {object|null} entry - запись продукта или null.
 * @returns {boolean} true, если запись соответствует или нет фильтра.
 */
export function processingMatches(rec, entry) {
  if (!entry) return true;
  return Array.isArray(entry.processing) && entry.processing.includes(rec.food_group);
}
