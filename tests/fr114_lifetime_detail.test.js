// #FR-114 (оператор 2026-10-11: «а где пожизненный расчет?»): раздел «Пожизненный расчёт» в «Подробном расчёте» совпадает с секторами «Сводки» (2 сценария × 2 региона)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { loadJsx } from './render_helper.js';
import { REGIONS } from '../src/calc/region.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const SC = [
  { id: 'adult', nuc: [['Cs-137', 100, 10]], over: {} },
  { id: 'child', nuc: [['Cs-137', 100, 10], ['Sr-90', 10, 1]], over: { age: '5y' } },
];
const flat = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[\s  ]+/g, ' ');
const rowsOf = (html, kind) => [...html.matchAll(new RegExp(`<tr data-lt="${kind}:(\\w+)"[^>]*>(.*?)</tr>`, 'g'))].map(m => ({ id: m[1], cells: [...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(c => flat(c[1]).trim()) }));
const pct = (s) => parseFloat(s.replace(',', '.').replace(/[^\d.]/g, ''));

test('FR-114: доза и доля каждого сектора в «Подробном расчёте» равны значениям секторов «Сводки», сумма долей 100 %', async () => {
  const { render, done } = await loadJsx('src/react/Result.jsx', 'default');
  try {
    for (const region of REGIONS) for (const sc of SC) {
      const tag = `${region}/${sc.id}`;
      const input = inputFor('milk', 'молоко', sc.nuc, { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...sc.over });
      const result = computeScenario(data, input);
      const calc = render({ result, input, meta: META, initialTab: 'calc' });
      const sum = flat(render({ result, input, meta: META, initialTab: 'sum' }));
      assert.ok(flat(calc).includes('Пожизненный расчёт (за'), tag);
      for (const kind of ['dose', 'risk']) {
        const all = rowsOf(calc, kind), total = all.find(r => r.id === 'total'), rows = all.filter(r => r.id !== 'total');
        assert.ok(rows.length >= 3, `${tag}/${kind}: строк ${rows.length}`);
        let pos = -1, acc = 0;
        for (const r of rows) {
          const c = r.cells, share = c[c.length - 1], value = kind === 'dose' ? `${c[3]}; ${c[4]}` : c[3];
          const at = sum.indexOf(`${share} ${value}`, pos + 1); // со сдвигом: у разных причин бывают одинаковые доля и значение
          assert.ok(at > pos, `${tag}/${kind}/${r.id}: «${share} ${value}» нет в «Сводке» в том же порядке`);
          pos = at; acc += pct(share);
        }
        // доли на экране округлены до 2 значащих цифр, поэтому сумма показанных долей — 100 % ± округление; точная сумма — в строке «Итого»
        assert.ok(Math.abs(acc - 100) < 1, `${tag}/${kind}: сумма долей ${acc}`);
        assert.match(total.cells[total.cells.length - 1], /^100\s*%$/, `${tag}/${kind}: итог 100 %`);
      }
    }
  } finally {
    done();
  }
});
