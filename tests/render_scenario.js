// #FR-81 P2-9: сценарий «как в интерфейсе» (форма → ввод → расчёт) и серверный рендер компонента с этим результатом
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { listChoices, computeScenario } from '../src/calc/model.js';
import * as S from '../src/react/formState.js';
import { renderJsx } from './render_helper.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
export const ch = listChoices(data);

/** Поля формы (`field`) и первого нуклида (`nuc`) по умолчанию: молоко, Cs-137 100 Бк/кг. Возвращает ввод, результат и рендер `comp` (файл, экспорт, функция props). */
export async function screen({ product = 'молоко', field = {}, nuc = { measured: '100' }, comp = ['src/react/Result.jsx', 'default', (result, input) => ({ result, input, meta: { datasets: 0, records: 0, sha: '00000000' } })] } = {}) {
  let raw = S.setField(S.setField(S.initialRaw(ch), ch, 'measuredForm', 'fresh'), ch, 'product', product); // #FR-81 V11: вид продукта обязателен
  // #FR-83 W05 (В5): начальный режим рациона — «по умолчанию»; сценарии старых тестов считаются по прежнему вводу «знаю»: 100 г, 1 раз в день, 1 день, 4 недели, 3 месяца
  for (const [k, v] of Object.entries({ dietMode: 'own', portionG: '100', timesPerDay: '1', daysPerWeek: '1', weeksPerMonth: '4', monthsPerYear: '3', ...field })) raw = S.setField(raw, ch, k, v);
  for (const [k, v] of Object.entries(nuc)) raw = S.setNuclideField(raw, 0, k, v);
  const input = S.toInput(raw, ch);
  const result = computeScenario(data, input);
  const html = await renderJsx(comp[0], comp[1], comp[2](result, input));
  return { input, result, html: html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ') };
}
