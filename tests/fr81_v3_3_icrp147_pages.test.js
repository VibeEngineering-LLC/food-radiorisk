// #FR-81 V3-3: ссылки на МКРЗ 147 — по печатным номерам страниц публикации, не по счёту страниц PDF (сверено с ICRP147_ANIB_50_1: ред. статья с. 6, резюме (g) с. 15, табл. 2.4 с. 28)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const T = JSON.parse(readFileSync(new URL('../src/ui/texts_v.json', import.meta.url), 'utf8'));

test('V3-3: AGE_CAVEAT — с. 6 (редакционная статья) и резюме (g), с. 15; номеров PDF нет', () => {
  assert.match(T.AGE_CAVEAT, /по МКРЗ 147, с\. 6 — до трёх раз/);
  assert.match(T.AGE_CAVEAT, /Публикация 147 \(2021\), с\. 6 и резюме \(g\), с\. 15\)\./);
  assert.ok(!/с\. (8|13|17|30)\b/.test(T.AGE_CAVEAT));
});
test('V3-3: REF_AGE_TABLE — табл. 2.4 на с. 28', () => {
  assert.match(T.REF_AGE_TABLE, /Публикация 147 \(2021\), табл\. 2\.4 \(с\. 28\):/);
  assert.ok(!/с\. (8|13|17|30)\b/.test(T.REF_AGE_TABLE));
});
