import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { renderJsx } from './render_helper.js';
import { REGIONS, recordsFor, roleOne } from '../src/calc/region.js';
import { buildDoseSlices } from '../src/calc/dose_sources.js';
import * as TV from '../src/ui/texts_v.js';
const { T, fill } = TV;
const timesVars = TV.timesVars ?? ((n) => ({ N: n })); // на коде до #FR-102 помощника нет — тест краснеет по существу, а не по ошибке импорта
import { plainSource } from '../src/ui/bibliography.js';
import { sourceFull } from '../src/ui/render.js';
import { buildBibliography } from '../src/ui/bibliography.js';

const META = { datasets: 0, records: 0, sha: '00000000' };
const norm = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ');
const scen = (region, over = {}) => inputFor('milk', 'молоко', [['Cs-137', 100, 10]], { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...over });
const calc = (region, over) => computeScenario(data, scen(region, over));
const tab = (region, t, over) => { const input = scen(region, over); return renderJsx('src/react/Result.jsx', 'default', { result: computeScenario(data, input), input, meta: META, initialTab: t }); };
const closeTo = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);
const CT_ROW = { world: 'med_ct_chest', ru: 'med_ct_chest_ru' };
const BAD = /оператор|audit|gaps-/i;

test('FR-102 v42: Б-1: доза процедуры сектора КТ равна дозе строки КТ на вкладке «Сравнение» в обоих режимах', async () => {
  for (const region of REGIONS) {
    const c = calc(region).comparison;
    const ds = buildDoseSlices(c, null, {});
    const row = c.rows.find(r => r.id === CT_ROW[region]);
    const slice = ds.slices.find(s => s.id === 'med_ct');
    assert.ok(row, `строка КТ не найдена для ${region}`);
    const ctN0 = c.parts.ct.freq * (c.parts.ct.share ?? 1);
    const H = c.horizonYears;
    const doseProc = slice.doseSv / (ctN0 * H * 1e-3);
    assert.ok(closeTo(doseProc, row.doseSv * 1e3), `доза процедуры ${doseProc} не равна дозе строки ${row.doseSv * 1e3}`);
    assert.ok(closeTo(c.parts.ct.doseProc, row.doseSv * 1e3), `parts.ct.doseProc ${c.parts.ct.doseProc} не равна дозе строки ${row.doseSv * 1e3}`);
    if (region === 'world') {
      assert.ok(closeTo(doseProc, 7), `доза процедуры в мире ${doseProc} не равна 7`);
      assert.equal(roleOne(recordsFor(data.compare, 'world'), 'ct_dose_proc').id, 'med_ct_chest');
    } else if (region === 'ru') {
      assert.equal(roleOne(recordsFor(data.compare, 'ru'), 'ct_dose_proc').id, 'med_ct_chest_ru');
    }
  }
});

test('FR-102 v42: R4: в тексте КП (mass_basis_note) нет слов «оператор», «audit», «gaps-»', async () => {
  const violators = [];
  for (const rec of data.transfer) {
    if (typeof rec.mass_basis_note === 'string' && BAD.test(rec.mass_basis_note)) {
      violators.push(rec.id);
    }
  }
  assert.deepEqual(violators, []);
  const rec = data.transfer.find(r => r.mass_basis_status === 'assumed' && r.nuclide === 'Cs-137' && (Number.isFinite(r.am) || Number.isFinite(r.gm)) && r.mass_basis === 'fresh');
  const input = scen('ru', { nuclides: [{ nuclide: 'Cs-137', source: 'deposition', measuredBqPerKg: null, measuredUncertaintyBqPerKg: 0, sampleDate: null, depositionKBqPerM2: 10, depositionDate: null, transferId: rec.id, variant: 'central' }] });
  const html = norm(await renderJsx('src/react/Result.jsx', 'default', { result: computeScenario(data, input), input, meta: META, initialTab: 'calc' }));
  assert.ok(html.includes(rec.mass_basis_note.slice(0, 30)), 'заметка основы массы показана');
  assert.ok(!BAD.test(html));
});

test('FR-102 v42: Р-4: склонение «раз» при любом числе', () => {
  for (let n = 1; n <= 300; n++) {
    const s = String(n);
    const out = fill(T.LIFE_SUB_SMOKE_NOTE, timesVars(s));
    const k = n % 100;
    const d = n % 10;
    let expected;
    if (k >= 11 && k <= 14) expected = 'раз';
    else if (d >= 2 && d <= 4) expected = 'раза';
    else expected = 'раз';
    assert.ok(out.includes(`в ${s} ${expected} выше`), `неверное склонение для n=${n}: ${out}`);
  }
  assert.ok(fill(T.LIFE_SUB_SMOKE_NOTE, timesVars('21')).includes('в 21 раз выше'));
  assert.ok(fill(T.LIFE_SUB_SMOKE_NOTE, timesVars('23')).includes('в 23 раза выше'));
  assert.ok(fill(T.LIFE_SUB_SMOKE_NOTE, timesVars('25')).includes('в 25 раз выше'));
  assert.ok(fill(T.LIFE_SUB_SMOKE_NOTE, timesVars('12')).includes('в 12 раз выше'));
});

test('FR-102 v42: Р-5: десятичная запятая в тексте радона (режим «Россия», вкладка «Сравнение», ОА 56,2)', async () => {
  const html = norm(await tab('ru', 'cmp'));
  assert.ok(!/\d\.\d+\s*Бк\/м/.test(html), 'найдена точка в числе Бк/м');
  assert.ok(html.includes('56,2 Бк/м'), 'нет 56,2 Бк/м');
});

test('FR-102 v42: Р-2: подпись «остальной» медицины не противоречит сектору КТ', () => {
  const cRu = calc('ru').comparison;
  const dsRu = buildDoseSlices(cRu, null, {});
  const sliceRu = dsRu.slices.find(s => s.id === 'med_other');
  assert.ok(sliceRu, 'слайс med_other не найден для ru');
  assert.ok(!sliceRu.label.includes('КТ других областей'), 'ru: med_other содержит «КТ других областей»');
  assert.ok(sliceRu.label.includes('КТ всех видов'), 'ru: med_other не содержит «КТ всех видов»');
  const cWorld = calc('world').comparison;
  const dsWorld = buildDoseSlices(cWorld, null, {});
  const sliceWorld = dsWorld.slices.find(s => s.id === 'med_other');
  assert.ok(sliceWorld, 'слайс med_other не найден для world');
  assert.ok(sliceWorld.label.includes('КТ других областей'), 'world: med_other не содержит «КТ других областей»');
});

test('FR-102 v42: Р-7: в режиме «Россия» текст «Сравнения» не упоминает строку «фон на улице»', async () => {
  const htmlRu = norm(await tab('ru', 'cmp'));
  const cRu = calc('ru').comparison;
  assert.ok(!cRu.rows.some(r => r.id === 'bg_street'), 'ru: есть строка bg_street');
  assert.ok(!htmlRu.includes('фон на улице'), 'ru: есть «фон на улице»');
  const htmlWorld = norm(await tab('world', 'cmp'));
  assert.ok(htmlWorld.includes('фон на улице'), 'world: нет «фон на улице»');
});

test('FR-102 v42: Р-8: в списке литературы авторы не дублируются', () => {
  const ids = ['BARKOVSKY2021', 'MAHESH2023', 'ONISHCHENKO2019'];
  for (const id of ids) {
    for (const text of [sourceFull(id), plainSource(id)]) {
      const firstWord = text.split(' ')[0];
      const count = text.split(firstWord + ' ').length - 1;
      if (id === 'BARKOVSKY2021') {
        assert.ok(!text.startsWith('Барковский А.Н. и др. Барковский'), 'BARKOVSKY2021: дублирование авторов');
      } else if (id === 'MAHESH2023') {
        assert.ok(!/Mahesh M\., Ansari A\.J\., Mettler F\.A\. Mahesh M\./.test(text), 'MAHESH2023: дублирование авторов');
      } else if (id === 'ONISHCHENKO2019') {
        assert.ok(!/Онищенко Г\.Г\. и др\. Онищенко Г\.Г\./.test(text), 'ONISHCHENKO2019: дублирование авторов');
      }
    }
  }
});

test('FR-102 v42: Р-9: режим «Мир» — НКДАР 2008 в списке источников', async () => {
  const ids = buildBibliography(calc('world')).map(b => b.id);
  assert.ok(ids.includes('UNSCEAR2008'), 'UNSCEAR2008 не в списке');
  const html = norm(await tab('world', 'cmp'));
  assert.ok(html.includes('НКДАР'), 'нет НКДАР');
  assert.ok(html.includes('Annex B') || html.includes('прил. B'), 'нет Annex B / прил. B');
});

test('FR-102 v42: Р-1: на «Сводке» есть пометка о причине различия радона', async () => {
  for (const region of REGIONS) {
    const html = norm(await tab(region, 'sum'));
    assert.ok(html.includes('Сектор «Радон в жилище» считает модуль радона'), `${region}: нет пометки о радоне`);
    assert.ok(html.includes('складывать их нельзя'), `${region}: нет «складывать их нельзя»`);
  }
});

test('FR-102 v42: Р-6: ребёнку на «Сравнении» не показан риск курящего', async () => {
  const child = { age: '5y', years: 10, lifetime: { fromAge: 3, toAge: 13 } };
  const htmlChild = norm(await tab('ru', 'cmp', child));
  assert.ok(htmlChild.includes('у некурящего'), 'ребёнку: нет «у некурящего»');
  assert.ok(!htmlChild.includes('у курящего'), 'ребёнку: есть «у курящего»');
  const htmlAdult = norm(await tab('ru', 'cmp'));
  assert.ok(htmlAdult.includes('у курящего'), 'взрослому: нет «у курящего»');
});
