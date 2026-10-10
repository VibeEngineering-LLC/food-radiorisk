import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './fr81_helpers.js';
import { matchProduct } from '../src/calc/products.js';
import { dietDefaultFor } from '../src/calc/diet.js';

const P = data.products;
const m = (n, confirm) => matchProduct(P, n, confirm);
const pick = (name) => dietDefaultFor(data.diet, { productName: name, state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products: P });

test('п. 1: вода из-под крана — как колодезная, не норматив упакованной воды', () => {
  const names = ['вода из крана', 'водопроводная вода', 'вода водопроводная', 'кранная вода', 'вода питьевая из-под крана', 'вода из-под крана', 'питьевая вода из крана'];
  for (const n of names) {
    assert.equal(m(n).status, 'ok', n);
    assert.equal(m(n).entry.id, 'p_voda_kolodeznaya', n);
    assert.equal(m(n).entry.norm.fresh, null, n);
    assert.equal(pick(n).group.code, 'water', n);
    assert.equal(pick(n).status, 'not_established', n);
  }
});

test('п. 1: бутилированная вода остаётся на нормативе упакованной воды', () => {
  const names = ['вода питьевая бутилированная', 'вода питьевая упакованная', 'вода в бутылках', 'вода бутилированная', 'бутилированная вода', 'питьевая вода в бутылках'];
  for (const n of names) {
    assert.equal(m(n).status, 'ok', n);
    assert.equal(m(n).entry.id, 'p_voda_pitevaya', n);
    assert.equal(m(n).entry.norm.fresh, 't044_water_cs137', n);
    assert.equal(pick(n).group.code, 'water', n);
  }
});

test('п. 1: «вода» и «вода питьевая» без уточнения — вопрос, а не норматив упакованной воды', () => {
  const names = ['вода', 'Вода', 'вода питьевая', 'питьевая вода'];
  for (const n of names) {
    assert.equal(m(n).status, 'ambiguous', n);
    assert.equal(m(n).entry, null, n);
    assert.deepEqual(m(n).candidates.map((c) => c.id).sort(), ['p_voda_kolodeznaya', 'p_voda_pitevaya'], n);
  }
  
  const unknowns = ['вода из реки', 'вода дождевая', 'вода морская'];
  for (const n of unknowns) {
    assert.equal(m(n).status, 'unknown', n);
    assert.equal(m(n).entry, null, n);
  }
  
  assert.equal(m('вода морская').composite.kind, 'changes', 'вода морская');
  
  assert.equal(m('вода минеральная').status, 'ok', 'вода минеральная');
  assert.equal(m('вода минеральная').entry.norm.fresh, 't044_water_cs137', 'вода минеральная');
});

test('п. 2: дикорастущая зелень — п. 13 Прил. 4, рацион «не установлено»', () => {
  const table = [
    ['черемша', 'p_cheremsha'],
    ['дикий чеснок', 'p_cheremsha'],
    ['чеснок дикий', 'p_cheremsha'],
    ['лук медвежий', 'p_cheremsha'],
    ['медвежий лук', 'p_cheremsha'],
    ['крапива', 'p_krapiva'],
    ['щавель дикий', 'p_shchavel_dikiy'],
    ['щавель конский', 'p_shchavel_dikiy'],
    ['конский щавель', 'p_shchavel_dikiy'],
    ['сныть', 'p_snyt'],
    ['папоротник-орляк', 'p_paporotnik_orlyak'],
    ['папоротник орляк', 'p_paporotnik_orlyak'],
    ['одуванчик', 'p_oduvanchik'],
    ['листья одуванчика', 'p_oduvanchik']
  ];
  
  for (const [name, id] of table) {
    assert.equal(m(name).status, 'ok', name);
    assert.equal(m(name).entry.id, id, name);
    assert.equal(m(name).entry.norm.fresh, 't021_p4_r13_cs137', name);
    assert.equal(m(name).entry.diet.group, 'greens_wild', name);
    assert.ok(m(name).entry.name_ru.includes('дикорастущ'), name);
    assert.equal(pick(name).group.code, 'greens_wild', name);
    assert.equal(pick(name).status, 'not_established', name);
    assert.equal(pick(name).rec, null, name);
  }
  
  const groupRec = data.diet.find((r) => r.kind === 'group' && r.code === 'greens_wild');
  assert.ok(groupRec, 'group greens_wild');
  assert.equal(groupRec.status, 'not_established', 'group greens_wild');
});

test('п. 2: культурные чеснок, щавель и лук не тронуты', () => {
  assert.equal(m('чеснок').status, 'ok', 'чеснок');
  assert.equal(m('чеснок').entry.id, 'p_chesnok', 'чеснок');
  assert.equal(m('чеснок').entry.diet.group, 'vegetables', 'чеснок');
  assert.equal(pick('чеснок').status, 'default', 'чеснок');
  
  assert.equal(m('щавель').status, 'ok', 'щавель');
  assert.equal(m('щавель').entry.id, 'p_shchavel', 'щавель');
  assert.equal(m('щавель').entry.diet.group, 'vegetables', 'щавель');
  
  assert.equal(m('лук').status, 'ok', 'лук');
  assert.equal(m('лук').entry.diet.group, 'vegetables', 'лук');
  
  assert.notEqual(m('дикий лук').entry?.id, 'p_cheremsha', 'дикий лук');
});
