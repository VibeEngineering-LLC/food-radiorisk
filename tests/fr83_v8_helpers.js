// #FR-83 v8: общие помощники тестов ядра — запись рациона и запуск сценария с заданным diet-блоком
import { data, inputFor } from './fr81_helpers.js';
import { dietDefaultFor } from '../src/calc/diet.js';
import { computeScenario } from '../src/calc/model.js';
export { data };
export const pick = (name, mode) => dietDefaultFor(data.diet, { productName: name, state: 'fresh', age: 'adult', lifetime: null, mode, products: data.products });
export const rec = (id) => data.diet.find(r => r.id === id);
export const run = (name, recId, group, mode = 'default') => { const r = rec(recId); return computeScenario(data, { ...inputFor('vegetables', name, [['Cs-137', 100]]), portionKg: r.value, portionsPerYear: 1, diet: { mode, id: r.id, group } }); };
