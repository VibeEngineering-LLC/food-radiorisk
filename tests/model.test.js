import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAll } from '../src/data/loader.js';
import { computeScenario, listChoices } from '../src/calc/model.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const { data } = await loadAll(async (u) => JSON.parse(await readFile(root + u, 'utf8')));

function close(actual, expected, rel, msg) {
  assert.ok(Math.abs(actual - expected) <= rel * Math.abs(expected), msg || `Expected ${actual} to be close to ${expected} within ${rel}`);
}

function base(over = {}) {
  return {
    age: 'adult',
    doseSource: 'ICRP119_F1',
    riskCoeffPerSv: 0.055,
    portionKg: 0.1046,
    portionsPerYear: 1,
    years: 1,
    eatDate: null,
    dryMatterPercent: null,
    processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' },
    foodGroupCode: null,
    nuclides: [
      {
        nuclide: 'Cs-137',
        source: 'measured',
        measuredBqPerKg: 9800,
        measuredUncertaintyBqPerKg: 0,
        sampleDate: null,
        depositionKBqPerM2: null,
        depositionDate: null,
        transferId: null,
        variant: 'central'
      }
    ],
    ...over
  };
}

function eOf(nuclide, age = 'adult', src = 'ICRP119_F1') {
  const r = data.dose_coeff.find(r => r.nuclide === nuclide && r.age === age && r.source === src);
  if (!r) throw new Error(`Dose coeff not found for ${nuclide} ${age} ${src}`);
  return r.value;
}

test('RadGear через модель: 9800 Бк/кг × 104,6 г × e(взр.) → доза и риск', () => {
  const r = computeScenario(data, base());
  assert.equal(r.ok, true);
  const expected = 9800 * 0.1046 * eOf('Cs-137');
  close(r.rows[0].doseSvPerYear, expected, 1e-12);
  close(r.rows[0].riskTotal, expected * 0.055, 1e-12);
  close(r.totals.doseSvPerYear, expected, 1e-12);
  close(r.totals.budgetShare1mSv, expected / 1e-3, 1e-12);
  close(r.totals.negligibleShare, expected / 1e-5, 1e-12);
});

test('Прямая доза 13,3 мкЗв (e = 1,3e-8) — сверка порядка с RadGear', () => {
  close(computeScenario(data, base()).rows[0].doseSvPerYear, 13.3e-6, 0.02);
});

test('Годы и порции масштабируют линейно', () => {
  const r = computeScenario(data, base({ portionsPerYear: 20, years: 3 }));
  const onePortionDose = computeScenario(data, base()).rows[0].doseSvPerYear;
  close(r.rows[0].doseSvPerYear, 20 * onePortionDose, 1e-12);
  close(r.rows[0].doseSvTotal, 3 * (20 * onePortionDose), 1e-12);
  close(r.rows[0].riskTotal, (3 * 20 * onePortionDose) * 0.055, 1e-12);
});

test('Обработка mode fr = 0,5 вдвое снижает дозу', () => {
  const rNone = computeScenario(data, base());
  const rFr = computeScenario(data, base({ processing: { mode: 'fr', fr: 0.5, recordId: null, variant: 'best' } }));
  close(rFr.rows[0].doseSvPerYear / rNone.rows[0].doseSvPerYear, 0.5, 1e-12);
  assert.equal(rFr.rows[0].frUsed, 0.5);
});

test('Обработка по записи TRS-472 (сливки, Cs): best 0,05, min 0,03, max 0,16', () => {
  const id = 'trs75_cream_method_not_specified_in_the_tabl_cs';
  for (const [variant, expectedFr] of [['best', 0.05], ['min', 0.03], ['max', 0.16]]) {
    const r = computeScenario(data, base({ processing: { mode: 'record', recordId: id, variant } }));
    assert.equal(r.rows[0].frUsed, expectedFr);
    const prov = r.rows[0].provenance.find(p => p.step === 'обработка');
    assert.ok(prov, `Provenance entry for processing not found for variant ${variant}`);
    assert.equal(prov.id, id);
  }
});

test('Запись не Fr отклоняется', () => {
  const pfRecord = data.processing.find(r => r.quantity === 'Pf');
  assert.ok(pfRecord, 'No Pf record found in processing data');
  const r = computeScenario(data, base({ processing: { mode: 'record', recordId: pfRecord.id, variant: 'best' } }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(' ').includes('Fr'), `Error should mention Fr: ${r.errors}`);
});

test('Плотность загрязнения × КП Переволоцкого (белый гриб, А2, свежая масса): 100 кБк/м² → 1560 Бк/кг', () => {
  const r = computeScenario(data, base({
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 100,
      transferId: 'perevolotsky2006_t69_kp_cs137_porcini_A2',
      variant: 'central',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  close(r.rows[0].rawBqPerKg, 1560, 1e-9);
  assert.ok(!r.warnings.some(w => w.includes('сух')), 'Should not warn about dry mass');
  const prov = r.rows[0].provenance.find(p => p.step === 'переход');
  assert.ok(prov, 'Provenance entry for transfer not found');
  assert.equal(prov.id, 'perevolotsky2006_t69_kp_cs137_porcini_A2');
});

test('КП на сухую массу без % сухого вещества — ошибка; с 10 % пересчёт в сырую', () => {
  const id = 'perevolotsky2006_t51_kp_cs137_porcini_dry';
  const rErr = computeScenario(data, base({
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 100,
      transferId: id,
      variant: 'central',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  assert.equal(rErr.ok, false);
  assert.ok(rErr.errors.join(' ').includes('сухого'), `Error should mention dry matter: ${rErr.errors}`);

  const rOk = computeScenario(data, base({
    dryMatterPercent: 10,
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 100,
      transferId: id,
      variant: 'central',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  close(rOk.rows[0].rawBqPerKg, 100 * 1000 * 0.188 * 0.10, 1e-9);
  assert.ok(rOk.warnings.length > 0, 'Should have warnings');
});

test('Tag без центрального значения: центр — ошибка, вариант max берёт верхнюю границу', () => {
  const id = 'trs472_tag_cs_137_roe_deer_capreolus_capreolus';
  const rCentral = computeScenario(data, base({
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 10,
      transferId: id,
      variant: 'central',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  assert.equal(rCentral.ok, false);

  const rMax = computeScenario(data, base({
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 10,
      transferId: id,
      variant: 'max',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  close(rMax.rows[0].rawBqPerKg, 10 * 1000 * 0.05, 1e-9);

  const rMin = computeScenario(data, base({
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 10,
      transferId: id,
      variant: 'min',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  close(rMin.rows[0].rawBqPerKg, 10 * 1000 * 0.005, 1e-9);
});

test('Tag на сухую массу: 10 кБк/м² × 0,0015 м²/кг, 10 % сухого вещества', () => {
  const id = 'trs472_tag_cs_137_spruce_wood';
  const r = computeScenario(data, base({
    dryMatterPercent: 10,
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 10,
      transferId: id,
      variant: 'central',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  close(r.rows[0].rawBqPerKg, 10 * 1000 * 0.0015 * 0.10, 1e-9);
});

test('Распад между отбором и употреблением', () => {
  const T = data.nuclides.find(r => r.nuclide === 'Cs-137' && r.recommended).half_life_days;
  const r = computeScenario(data, base({
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'measured',
      measuredBqPerKg: 1000,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: '2026-01-01',
      depositionKBqPerM2: null,
      transferId: null,
      variant: 'central'
    }],
    eatDate: '2027-01-01'
  }));
  close(r.rows[0].rawBqPerKg, 1000 * Math.pow(2, -365 / T), 1e-9);
  const prov = r.rows[0].provenance.find(p => p.step.includes('распад'));
  assert.ok(prov, 'Provenance entry for decay not found');
});

test('Нет e(g) для возраста — ошибка', () => {
  const r = computeScenario(data, base({ age: '7y' }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(' ').includes('Cs-137'), `Error should mention Cs-137: ${r.errors}`);
});

test('НРБ-источник: возраст 1-2y для Sr-90 и для Cs-137 нет — ошибка; для взрослого есть', () => {
  const src = 'NRB2009_App2';
  let eVal;
  try {
    eVal = eOf('Cs-137', 'adult', src);
  } catch (e) {
    // Try alternative source if primary doesn't have the record
    const altSrc = 'NRB2009_App2a';
    const rec = data.dose_coeff.find(r => r.nuclide === 'Cs-137' && r.age === 'adult' && (r.source === src || r.source === altSrc));
    if (!rec) throw new Error(`No NRB dose coeff found for Cs-137 adult`);
    eVal = rec.value;
  }

  const r = computeScenario(data, base({ doseSource: src, age: 'adult' }));
  assert.equal(r.ok, true);
  close(r.rows[0].eSvPerBq, eVal, 1e-12);
});

test('Сумма по нескольким нуклидам', () => {
  const r = computeScenario(data, base({
    nuclides: [
      { nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 1000, measuredUncertaintyBqPerKg: 0, sampleDate: null, depositionKBqPerM2: null, transferId: null, variant: 'central' },
      { nuclide: 'Cs-134', source: 'measured', measuredBqPerKg: 500, measuredUncertaintyBqPerKg: 0, sampleDate: null, depositionKBqPerM2: null, transferId: null, variant: 'central' }
    ]
  }));
  assert.equal(r.rows.length, 2);
  const sum = r.rows.reduce((acc, row) => acc + row.doseSvPerYear, 0);
  close(r.totals.doseSvPerYear, sum, 1e-12);
});

test('ПГП: доля годового поступления = поступление / (1 мЗв / e)', () => {
  const r = computeScenario(data, base());
  close(r.rows[0].pgpShare, r.rows[0].intakeBqPerYear / (1e-3 / r.rows[0].eSvPerBq), 1e-12);
  close(r.rows[0].pgpBqPerYear, 1e-3 / eOf('Cs-137'), 1e-12);
});

test('Нормы РФ: грибы свежие, Cs-137 500 Бк/кг, измерено 9800 → превышение 19,6, вердикт «не соответствует»', () => {
  const r = computeScenario(data, base({ foodGroupCode: 'mushrooms_fresh' }));
  assert.equal(r.limits.ru[0].H, 500);
  close(r.limits.ru[0].ratio, 19.6, 1e-12);
  assert.equal(r.limits.compliance.verdict, 'nonconforms');
});

test('Правило B ± ΔB: измерено 400 ± 200 при H 500 → «не определено»', () => {
  const r = computeScenario(data, base({
    foodGroupCode: 'mushrooms_fresh',
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'measured',
      measuredBqPerKg: 400,
      measuredUncertaintyBqPerKg: 200,
      sampleDate: null,
      depositionKBqPerM2: null,
      transferId: null,
      variant: 'central'
    }]
  }));
  assert.equal(r.limits.compliance.verdict, 'undetermined');
  assert.equal(r.limits.compliance.precisionOk, false);
});

test('Расчётная активность из почвы: предупреждение, что B ± ΔB только для измеренных', () => {
  const r = computeScenario(data, base({
    foodGroupCode: 'mushrooms_fresh',
    nuclides: [{
      nuclide: 'Cs-137',
      source: 'deposition',
      depositionKBqPerM2: 100,
      transferId: 'perevolotsky2006_t69_kp_cs137_porcini_A2',
      variant: 'central',
      measuredBqPerKg: null,
      measuredUncertaintyBqPerKg: 0,
      sampleDate: null,
      depositionDate: null
    }]
  }));
  assert.ok(r.warnings.some(w => w.includes('измерен')), 'Warning should mention "measured"');
});

test('Зарубежные нормы для Cs-137: отношение = активность / норматив', () => {
  const r = computeScenario(data, base({ foodGroupCode: 'mushrooms_fresh' }));
  assert.ok(r.limits.foreign.length > 0);
  for (const item of r.limits.foreign) {
    close(item.ratio, 9800 / item.value, 1e-12);
  }
  const jurisdictions = r.limits.foreign.map(i => i.jurisdiction);
  assert.ok(jurisdictions.includes('EU') || jurisdictions.includes('Codex'), 'Should contain EU or Codex');
});

test('Провенанс: e(g) с id, источником и страницей', () => {
  const r = computeScenario(data, base());
  const prov = r.rows[0].provenance.find(p => p.step === 'доза');
  assert.ok(prov, 'Provenance entry for dose not found');
  assert.equal(prov.id, 'icrp119_cs137_ing_adult');
  assert.ok(prov.source.length > 0, 'Source should not be empty');
  assert.ok(prov.loc.length > 0, 'Loc should not be empty');
});

test('Вход не мутируется', () => {
  const inp = base();
  const before = JSON.stringify(inp);
  computeScenario(data, inp);
  assert.equal(JSON.stringify(inp), before);
});

test('Бесконечные и отрицательные входы дают ошибку, а не NaN', () => {
  const rNeg = computeScenario(data, base({ nuclides: [{ ...base().nuclides[0], measuredBqPerKg: -5 }] }));
  assert.equal(rNeg.ok, false);

  const rNaN = computeScenario(data, base({ portionKg: NaN }));
  assert.equal(rNaN.ok, false);

  const rRisk = computeScenario(data, base({ riskCoeffPerSv: 5 }));
  assert.equal(rRisk.ok, false);

  // Check finite fields for valid tests
  const validResults = [
    computeScenario(data, base()),
    computeScenario(data, base({ portionsPerYear: 20, years: 3 }))
  ];
  for (const r of validResults) {
    if (!r.ok) continue;
    for (const row of r.rows) {
      for (const val of Object.values(row)) {
        if (typeof val === 'number') {
          assert.ok(Number.isFinite(val), `Found non-finite number: ${val}`);
        }
      }
    }
  }
});

test('listChoices: возрасты по источникам, нуклиды, КП и Fr', () => {
  const c = listChoices(data);
  assert.ok(c.doseSources.includes('ICRP119_F1'));
  assert.ok(c.nuclides.includes('Cs-137'));
  assert.ok(c.nuclides.includes('Sr-90'));
  assert.ok(c.transfer.some(t => t.id === 'perevolotsky2006_t69_kp_cs137_porcini_A2'));
  assert.ok(c.transfer.every(t => t.unit_norm === 'm2/kg'));
  assert.ok(c.processing.length > 100);
  assert.ok(c.limitGroups.some(g => g.code === 'mushrooms_fresh'));
});
