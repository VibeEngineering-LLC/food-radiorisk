// #FR-81 V10: перечень записей прил. 4 ТР ТС 021/2011 со своим нормативом для сухого продукта (isDryNorm) — для отчёта пункта; запуск: node tools/dry_norm_groups.mjs
import { readFileSync } from 'node:fs';
import { isDryNorm } from '../src/calc/form_norm.js';
import { isP4 } from '../src/calc/norms.js';

const d = JSON.parse(readFileSync(new URL('../public/data/limits_ru.json', import.meta.url), 'utf8'));
const recs = (d.records || d).filter(r => isP4(r) && Number.isFinite(r.value));
const rows = recs.filter(isDryNorm).map(r => `${r.id}\t${r.food_group_code}\t${r.nuclide}\t${r.value} Бк/кг\t${r.food_group_ru.split(' — ')[0]}`);
console.log(`записей прил. 4 со значением: ${recs.length}; со своим нормативом для сухого: ${rows.length}`);
console.log(rows.join('\n'));
