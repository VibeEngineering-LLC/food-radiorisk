// #FR-83 (D-023): выбор умолчания по состоянию формы; отображение рациона — W07
import { dietDefaultFor } from '../calc/diet.js';
import { lifetimeOf } from './form.js';
import { dietLines } from './diet_lines.js';

/** результат dietDefaultFor для режимов «не знаю — среднее / высокое»; в режиме «знаю» — null */
export function dietPickFor(raw, choices) {
  if (raw.dietMode !== 'default' && raw.dietMode !== 'high') return null;
  return dietDefaultFor(choices.diet, { productName: raw.product, state: raw.measuredForm, age: raw.age, lifetime: lifetimeOf(raw), mode: raw.dietMode, products: choices.products, manualGroup: raw.dietGroup || null, confirmId: raw.productConfirm || null });
}

/** строки блока «Рацион» формы (W07/W09): режим + строки умолчания или причина «не установлено» */
export function dietView(raw, choices) {
  return { mode: raw.dietMode, ...dietLines(dietPickFor(raw, choices), choices.diet, raw.dietMode) };
}
