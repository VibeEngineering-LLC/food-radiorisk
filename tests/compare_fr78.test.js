// #FR-78: строка «Фон на улице» в сравнении — значение пересчитывается независимо из параметров НКДАР ООН, место в порядке строк, провенанс
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { buildComparison, withRadon, withDwelling } from '../src/calc/compare.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));
const close = (a, e, msg) => assert.ok(Math.abs(a - e) <= 1e-9 * Math.abs(e), `${msg || ''} expected ${e}, got ${a}`);
const totals = { doseSvPerYear: 60.5e-6, doseSvTotal: 60.5e-6 };
const inp = (over = {}) => ({ age: 'adult', years: 1, lifetime: null, riskCoeffPerSv: 0.05, ...over });
const rec = (id) => data.compare.find(x => x.id === id);
const row = (c, id) => c.rows.find(x => x.id === id);

test('параметры строки: значения из НКДАР ООН и непустой провенанс', () => {
  for (const id of ['bg_street', 'street_hours', 'street_external', 'street_radon_c', 'street_radon_f', 'radon_dcf']) {
    const x = rec(id);
    assert.ok(x, id);
    for (const f of ['source', 'loc', 'quote']) assert.ok(typeof x[f] === 'string' && x[f].length > 10, id + ' ' + f);
  }
  assert.equal(rec('street_hours').value, 1760);
  assert.equal(rec('street_external').value, 0.07);
  assert.equal(rec('street_radon_c').value, 10);
  assert.equal(rec('street_radon_f').value, 0.6);
  assert.equal(rec('radon_dcf').value, 9);
  assert.equal(rec('street_external').source, 'UNSCEAR2008');
  assert.equal(rec('street_radon_c').source, 'UNSCEAR2000');
  assert.equal(rec('bg_street').source, 'UNSCEAR2000');
  assert.equal(rec('street_hours').value + rec('dwell_hours').value, 8760);
});

test('значение bg_street = внешнее облучение + радон-222, пересчёт независимо', () => {
  const radon = 10 * 0.6 * 1760 * 9 * 1e-6;
  const total = 0.07 + radon;
  close(radon, 0.09504);
  close(total, 0.16504);
  close(rec('bg_street').value, total);
  assert.ok(Math.abs(rec('bg_street').value - 0.165) < 5e-4);
  assert.ok(rec('bg_street').value > 0.07 && rec('bg_street').value > radon);
  assert.equal(rec('bg_street').unit, 'мЗв/год');
});

test('строка в таблице: после природного фона, постоянная за горизонт, риск = доза × r', () => {
  const c = buildComparison(data.compare, totals, inp(), 0.05);
  assert.deepEqual(c.rows.slice(-2).map(x => x.id), ['bg_natural_world', 'bg_street']);
  const s = row(c, 'bg_street');
  assert.equal(s.kind, 'horizon');
  close(s.doseSv, 0.16504e-3 * 50);
  assert.ok(s.label.includes('Фон на улице') && s.label.includes('20 %') && s.label.includes('1760 ч/год') && s.label.includes('ОА 10 Бк/м³'));
  close(row(c, 'bg_natural_world').doseSv / s.doseSv, 2.4 / 0.16504);
  const k = buildComparison(data.compare, totals, inp({ age: '5y' }), 0.05);
  close(row(k, 'bg_street').doseSv, 0.16504e-3 * 65);
  const w = withRadon(withDwelling(c, 0.15, 0.05, 'x'), { totalDose_mSv: 1 }, 0.05, 'радон');
  assert.deepEqual(w.rows.slice(-4).map(x => x.id), ['bg_natural_world', 'bg_street', 'dwelling', 'radon_home']);
  assert.equal(c.rows.filter(x => x.kind === 'single').some(x => x.id === 'bg_street'), false);
  close(c.equivalents.bgDays, 60.5e-6 / 2.4e-3 * 365);
});

test('подпись природного фона: три части — среднее по миру, дом/улица с ОА радона, космическое и внутреннее', () => {
  const l = rec('bg_natural_world').label_ru;
  assert.ok(l.includes('среднее по миру'));
  assert.ok(l.includes('80 %') && l.includes('40 Бк/м³'));
  assert.ok(l.includes('20 %') && l.includes('10 Бк/м³'));
  assert.ok(l.includes('космическое и внутреннее'));
  assert.equal(rec('bg_natural_world').value, 2.4);
});

test('источники UNSCEAR2000 и UNSCEAR2008 есть в реестре и в кратких названиях', async () => {
  const reg = JSON.parse(await readFile(root + 'public/data/sources.json', 'utf8')).sources;
  const short = JSON.parse(await readFile(root + 'src/ui/source_short.json', 'utf8'));
  for (const code of ['UNSCEAR2000', 'UNSCEAR2008']) {
    assert.ok(reg[code] && reg[code].title_ru, code);
    assert.ok(short[code], code);
  }
  assert.equal(reg.UNSCEAR2008.year, 2008);
});
