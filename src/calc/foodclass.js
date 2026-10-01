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
    ['infant', /детск|младен/, /кроме детск|без категории для младенц/],
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

/** @param {string} foodGroupCode */
export function productClasses(foodGroupCode) {
  if (foodGroupCode === 'baby_food') return ['infant'];
  if (['milk', 'milk_products'].includes(foodGroupCode)) return ['milk'];
  if (foodGroupCode === 'water') return ['water', 'liquid'];
  return ['general'];
}

/** @param {string} foodCategoryRu @param {string} foodGroupCode */
export function appliesTo(foodCategoryRu, foodGroupCode) {
  const f = foreignClasses(foodCategoryRu);
  const p = productClasses(foodGroupCode);
  return p.some(c => f.includes(c));
}
