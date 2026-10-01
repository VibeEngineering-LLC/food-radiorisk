import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciKm2ToKBqM2, kBqM2ToCiKm2, svToMicroSv } from '../src/calc/units.js';

// Эталон: определение кюри (1 Ки = 3,7e10 Бк) → 1 Ки/км² = 37 кБк/м²; Атлас Европы 1998, `:1528` (15 Ки/км² = 555 кБк/м²).
test('Ки/км² → кБк/м²: 1 → 37, 15 → 555 (зона Атласа EC 1998)', () => {
  assert.equal(ciKm2ToKBqM2(1), 37);
  assert.equal(ciKm2ToKBqM2(15), 555);
});

test('кБк/м² → Ки/км² обратим', () => {
  assert.equal(kBqM2ToCiKm2(555), 15);
});

test('Зв → мкЗв', () => {
  assert.ok(Math.abs(svToMicroSv(1.33e-5) - 13.3) < 1e-9);
});
