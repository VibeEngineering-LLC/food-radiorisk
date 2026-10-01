// #FR-22: место в источнике и единицы — по-русски, без служебных пометок (.md-строки)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitRu, locRu } from '../src/ui/ru.js';
const U = [['Sv/Bq', 'Зв/Бк'], ['Bq/kg', 'Бк/кг'], ['Bq/L', 'Бк/л'], ['Bq/yr', 'Бк/год'], ['kg/day', 'кг/сут'], ['d/L', 'сут/л'], ['m2/kg', 'м²/кг'],
  ['(Bq/kg)/(kBq/m2)', '(Бк/кг)/(кБк/м²)'], ['(nGy/h)/(kBq/m2)', '(нГр/ч)/(кБк/м²)'], ['kg/m3', 'кг/м³'], ['cm2/g', 'см²/г'], ['мЗв/год', 'мЗв/год'], ['dimensionless', 'безразм.'], ['y', 'лет']];
const L = [['Table 17, TRS-472 book p.47 (PDF p.58)', 'табл. 17, с. 47 (с. PDF 58)'],
  ['TRS-472 Section 5.1, book p.40 (PDF p.51); .md lines 4567-4570', 'TRS-472 разд. 5.1, с. 40 (с. PDF 51)'],
  ['Атлас МЧС 2009, .md lines 2453-2454', 'Атлас МЧС 2009'], ['.md line 2466', ''], ['page_113.txt:40 (early years)', ''],
  ['Perevolotsky 2006, Табл. 5.1 PDF p.179 (.md 2479); Табл. 5.3 PDF p.186', 'Табл. 5.1 с. PDF 179; Табл. 5.3 с. PDF 186'],
  ['Perevolotsky A.N., Distribution of 137Cs and 90Sr in forest biogeocenoses, Gomel 2006, section 3.3, PDF p.59 (md line 932)', 'разд. 3.3, с. PDF 59'],
  ['Shubayr 2017 handbook, section 8 NCRP parameters, PDF p.84 (printed p.81)', 'разд. 8 параметры NCRP, с. PDF 84 (с. 81)'],
  ['Vol. I Annex B para 45, printed p.90 (PDF p.94)', 'т. I прил. B п. 45, с. 90 (с. PDF 94)'],
  ['Table 82 (cont.), TRS-472 book p.164 (PDF p.175)', 'табл. 82 (продолж.), с. 164 (с. PDF 175)'],
  ['Table F.1, PDF p.79 (печ. 78)', 'табл. F.1, с. PDF 79 (печ. 78)'],
  ['печ. стр. 75 (PDF p.39), табл. 9, площадка I', 'печ. стр. 75 (с. PDF 39), табл. 9, площадка I']];
test('единицы по-русски', () => { for (const [a, b] of U) assert.equal(unitRu(a), b, a); });
test('место в источнике по-русски, без .md-строк', () => { for (const [a, b] of L) assert.equal(locRu(a), b, a); });
