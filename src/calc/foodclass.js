/** @type {Record<string, string>} */
export const FOOD_CLASS_RU = {
  infant: 'детское питание',
  milk: 'молоко и молочные продукты',
  water: 'питьевая вода',
  liquid: 'жидкие продукты',
  minor: 'малозначимые продукты',
  general: 'прочие пищевые продукты'
};

/** @param {string} foodCategoryRu */
export function foreignClasses(foodCategoryRu) {
  const t = String(foodCategoryRu ?? '').toLowerCase().replace(/ё/g, 'е');
  if (!t.trim()) return [];
  const rules = [
    ['infant', /детск|младен/, /кроме детск|без (отдельной )?категории для младенц/],
    ['milk', /молок|молочн/, null], // исключение «кроме молочн» в реальных категориях не встречается (52 записи) — не нужно
    ['water', /питьев/, /жидкие/],
    ['liquid', /жидкие/, null],
    ['minor', /малозначим/, /кроме малозначим/],
    ['general', /прочие|все пищевые|пищевые продукты, кроме|общие|все прочие|кроме малозначим/, null]
  ];
  const classes = [];
  for (const [cls, match, exclude] of rules) {
    if (match.test(t) && (!exclude || !exclude.test(t))) classes.push(cls);
  }
  return classes.length ? classes : ['general'];
}

/**
 * Классы группы норм ТР ТС по убыванию специфичности (группа выбрана вручную или продукт не распознан словарём).
 * #FR-81 E09: у молока и детского питания есть и общие нормы (Codex, FDA). Пункт внутри группы молочных продуктов неизвестен — как у молока.
 * @param {string|null} foodGroupCode
 */
export function productClasses(foodGroupCode) {
  if (foodGroupCode === 'baby_food') return ['infant', 'general'];
  if (foodGroupCode === 'milk' || foodGroupCode === 'milk_products') return ['milk', 'general'];
  if (foodGroupCode === 'water') return ['water', 'liquid'];
  return ['general'];
}

/**
 * #FR-85: классы продукта — поле codex записи словаря (сыр и масло — не «молоко», сливки — молоко), если группа норм не изменена вручную:
 * entryCode — группа строки норматива записи (catalog.js normCodeFor), foodGroupCode — группа, по которой считается сравнение.
 * @param {object|null} entry @param {string|null} entryCode @param {string|null} foodGroupCode
 */
export function classesFor(entry, entryCode, foodGroupCode) {
  if (entry && Array.isArray(entry.codex) && entry.codex.length && (entryCode || null) === (foodGroupCode || null)) return [...entry.codex];
  return productClasses(foodGroupCode);
}

/** Номер первого класса продукта среди классов нормы (0 — самая узкая); -1 — норма к продукту не относится. */
export function classRank(foodCategoryRu, classes) {
  const f = foreignClasses(foodCategoryRu);
  return classes.findIndex(c => f.includes(c));
}

/** @param {string} foodCategoryRu @param {string} foodGroupCode */
export function appliesTo(foodCategoryRu, foodGroupCode) {
  return classRank(foodCategoryRu, productClasses(foodGroupCode)) >= 0;
}
