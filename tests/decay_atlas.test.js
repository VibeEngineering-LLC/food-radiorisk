import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decayFactor } from '../src/calc/core.js';

// Эталон: Атлас загрязнения Европы цезием (EC 1998), табл. IV.1 (.md :2846–2882); T½ — рекомендованные записи public/data/nuclides.json.
const nuc = JSON.parse(readFileSync(new URL('../public/data/nuclides.json', import.meta.url), 'utf8')).records;
const T = (n) => nuc.find(r => r.nuclide === n && r.recommended).half_life_days;
const YEARS = [0, 0.5, 1, 2, 5, 10, 20, 50, 100];
const TABLE = { 'Cs-137': ['1', '0.99', '0.98', '0.96', '0.89', '0.79', '0.63', '0.32', '0.10'],
                'Cs-134': ['0.56', '0.47', '0.40', '0.29', '0.10', '0.019', '0.0007', '0', '0'] };
const START = { 'Cs-137': 1, 'Cs-134': 0.56 }; // Cs-134 : Cs-137 = 0,56 на май 1986 (Атлас :2943)

for (const n of Object.keys(TABLE)) {
  test(`Атлас Европы табл. IV.1: ${n} — 9 точек в пределах половины последнего разряда таблицы`, () => {
    TABLE[n].forEach((s, i) => {
      const dec = s.includes('.') ? s.split('.')[1].length : 0;
      const calc = START[n] * decayFactor(T(n), YEARS[i] * 365.25);
      // полразряда таблицы + разброс T½ между оценками (DDEP/ENSDF/NUBASE/ICRP 107 ≈ 0,5 %): dA = A·ln2·t/T·(ΔT/T).
      // Нужен в точке Cs-137 2 года: точно 0,9549–0,9551 (граница округления 0,955), в таблице 0,96.
      const tSpread = calc * Math.LN2 * (YEARS[i] * 365.25 / T(n)) * 0.005;
      const tol = (s === '0' ? 5e-5 : 0.5 * 10 ** -dec) + tSpread;
      assert.ok(Math.abs(calc - Number(s)) <= tol + 1e-12, `${n} t=${YEARS[i]} y: расчёт ${calc}, таблица ${s}`);
    });
  });
}
