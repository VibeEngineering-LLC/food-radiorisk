import {
  intakeBq, committedDoseSv, riskFromDose, pgpFromDose, decayFactor,
  productFromDeposition, dryToFresh, complianceB, VERDICT
} from './core.js';
import { productFromSample, depositionEstimate, depositionBounds, KBQ_PER_M2_PER_CI_PER_KM2 } from './sample.js';
import { appliesTo, productClasses } from './foodclass.js';
import { limitRecordFor } from './catalog.js';
import { resolveProcessing } from './processing.js';
import { isNatural, LIMIT_YEAR_SV, LIMIT_LIFE_SV } from './origin.js';
import { AGE_BANDS, lifetimeDose } from './lifetime.js';

/** @param {object} data */
export function listChoices(data) {
  const ages = {};
  for (const r of data.dose_coeff) {
    if (!ages[r.source]) ages[r.source] = [];
    if (!ages[r.source].includes(r.age)) ages[r.source].push(r.age);
  }
  return {
    ages,
    doseSources: [...new Set(data.dose_coeff.map(r => r.source))],
    nuclides: [...new Set(data.dose_coeff.map(r => r.nuclide))],
    transfer: data.transfer.filter(r => (r.quantity === 'Tag' || r.quantity === 'KP') && r.unit_norm === 'm2/kg').map(r => ({
      ...r, hasCentral: Number.isFinite(r.am) || Number.isFinite(r.gm)
    })),
    processing: data.processing.filter(r => r.quantity === 'Fr').map(r => ({ id: r.id, food: r.food, food_group: r.food_group, process_ru: r.process_ru, nuclide: r.nuclide, value_best: r.value_best, value_min: r.value_min, value_max: r.value_max, source: r.source, level: r.level })),
    dryMatter: data.transfer.filter(r => r.quantity === 'dry_matter'),
    limitsRu: data.limits_ru,
    limitGroups: [...new Map(data.limits_ru.map(r => [r.food_group_code, { code: r.food_group_code, ru: r.food_group_ru }])).values()]
  };
}

/** @param {object} data @param {object} input */
export function computeScenario(data, input) {
  const errors = [], warnings = [], rows = [];
  // #FR-65: питание «всю жизнь» — рацион одинаков во все годы, e(g) по возрасту в момент поступления
  // МКРЗ 103 табл. 1: 4,1·10⁻² / 4,2·10⁻² — для взрослых; детям и режиму «до 70 лет» подходит коэффициент для всего населения (5,5·10⁻² / 5,7·10⁻²)
  if ((input.age !== 'adult' || input.lifetime) && [0.041, 0.042].includes(input.riskCoeffPerSv)) warnings.push('коэффициент риска для взрослых (МКРЗ 103, табл. 1) занижает риск для ребёнка и для питания с детства; для них берите коэффициент для всего населения (5,5·10⁻² или 5,7·10⁻²)');
  if (input.lifetime) warnings.push(`режим «${input.lifetime.fromAge}–${input.lifetime.toAge} лет»: рацион принят одинаковым во все годы, коэффициент e(g) берётся по возрастной группе в момент поступления (ICRP 119)`);
  for (const n of input.nuclides) {
    try { rows.push(rowFor(data, input, n, warnings)); } catch (e) { errors.push(`${n.nuclide}: ${e.message}`); }
  }
  if (errors.length > 0) return { ok: false, errors, warnings, rows, totals: {}, limits: {} };

  const doseY = rows.reduce((s, r) => s + (r.doseSvPerYear || 0), 0);
  const doseT = rows.reduce((s, r) => s + (r.doseSvTotal || 0), 0);
  const riskT = rows.reduce((s, r) => s + (r.riskTotal || 0), 0);
  // F3 (audit/risk-fields-review-2026-10-03.md): пределы НРБ — только для техногенной части
  const tech = rows.filter(r => !r.natural);
  const techY = tech.reduce((s, r) => s + (r.doseSvPerYear || 0), 0);
  const techT = tech.reduce((s, r) => s + (r.doseSvTotal || 0), 0);

  const limits = calcLimits(data, input, rows, warnings);

  // #FR-20/#FR-42: уровни НРБ-99/2009 п. 2.3 — «пределы доз облучения в течение года устанавливаются исходя из … индивидуального
  // пожизненного риска … населения 5,0·10⁻⁵»: с уровнями сравнивается пожизненный риск от ОДНОГО года потребления, не от всего периода
  const riskY = rows.length ? riskFromDose(doseY, input.riskCoeffPerSv) : 0;
  const lvl = (id) => (data.risk || []).find(r => r.id === id && Number.isFinite(r.value));
  const neg = lvl('nrb2009_p23_negligible_risk'), lim = lvl('nrb2009_p23_lifetime_risk_pop');
  const riskAssessment = rows.length && neg && lim ? {
    level: riskY <= neg.value ? 'negligible' : riskY <= lim.value ? 'within' : 'exceeds',
    negligible: { value: neg.value, id: neg.id, loc: neg.loc }, limit: { value: lim.value, id: lim.id, loc: lim.loc },
    oneIn: riskY > 0 ? 1 / riskY : null,
    oneInTotal: riskT > 0 ? 1 / riskT : null
  } : null;

  return {
    ok: true, errors, warnings, rows,
    totals: {
      doseSvPerYear: rows.length ? doseY : null,
      doseSvTotal: rows.length ? doseT : null,
      riskTotal: rows.length ? riskT : null,
      riskPerYear: rows.length ? riskY : null,
      techDoseSvPerYear: tech.length ? techY : null,
      techDoseSvTotal: tech.length ? techT : null,
      techNuclides: tech.map(r => r.nuclide),
      naturalNuclides: rows.filter(r => r.natural).map(r => r.nuclide),
      budgetShare1mSv: tech.length ? techY / LIMIT_YEAR_SV : null,
      lifeShare70mSv: tech.length ? techT / LIMIT_LIFE_SV : null,
      negligibleShare: rows.length ? doseY / 1e-5 : null,
      riskAssessment
    },
    limits
  };
}

function rowFor(data, input, n, warnings) {
  const prov = [];
  const warn = (msg) => warnings.push(`${n.nuclide}: ${msg}`);
  // 1. Dose coeff
  const dcRec = pickDose(data.dose_coeff, n.nuclide, input.age, input.doseSource);
  if (!dcRec) throw new Error(`нет e(g) для ${n.nuclide}, ${input.age}, ${input.doseSource}`);
  prov.push({ step: 'доза', what: 'коэффициент ожидаемой эффективной дозы при поступлении с пищей', id: dcRec.id, source: dcRec.source, loc: dcRec.loc, level: dcRec.level, value: dcRec.value, unit: dcRec.unit });

  // 2. Raw activity
  let rawBqPerKg = null, atSampleBqPerKg = null;
  if (n.source === 'measured') {
    if (!Number.isFinite(n.measuredBqPerKg) || n.measuredBqPerKg < 0) throw new Error('измеренная активность некорректна');
    rawBqPerKg = n.measuredBqPerKg;
    // проба могла быть сконцентрирована (высушена, озолена): A_продукта = A_счётного образца / K
    const K = n.samplePrep?.concentrationFactor;
    const prepMode = n.samplePrep?.mode;
    if ((K === undefined || K === null) && prepMode && prepMode !== 'as_is') throw new Error('проба сконцентрирована, но K не задан (для высушенной пробы нужен % сухого вещества)');
    if (K !== undefined && K !== null && K !== 1) {
      rawBqPerKg = productFromSample(rawBqPerKg, K);
      prov.push({ step: 'проба', id: null, source: null, loc: null, level: null, value: K, unit: '', note: `коэффициент концентрирования (${n.samplePrep.mode || 'не указан'})${Number.isFinite(n.samplePrep.rawMassG) && Number.isFinite(n.samplePrep.probeMassG) ? `: m сырья ${n.samplePrep.rawMassG} г / m пробы ${n.samplePrep.probeMassG} г` : ''}` });
    }
    atSampleBqPerKg = rawBqPerKg;
    if (n.sampleDate && input.eatDate) {
      const halfRec = data.nuclides.find(r => r.nuclide === n.nuclide && r.recommended);
      if (!halfRec) { warn('нет периода полураспада — поправка на распад не применена'); prov.push({ step: 'распад', id: null, source: null, loc: null, level: null, value: null, unit: null, note: 'нет периода полураспада' }); }
      else {
        const days = (new Date(input.eatDate) - new Date(n.sampleDate)) / 86400000;
        rawBqPerKg *= decayFactor(halfRec.half_life_days, days);
        prov.push({ step: 'распад', what: 'период полураспада', id: halfRec.id, source: halfRec.source, loc: null, level: null, value: halfRec.half_life_days, unit: 'days' });
      }
    }
  } else { // deposition
    const tRec = data.transfer.find(r => r.id === n.transferId);
    if (!tRec) throw new Error(`нет записи перехода ${n.transferId}`);
    if (tRec.unit_norm !== 'm2/kg') throw new Error('единица коэффициента не установлена');
    if (!Number.isFinite(tRec.unit_factor)) throw new Error('unit_factor не установлен');
    
    let c = pickTransferValue(tRec, n.variant);
    if (c === null) throw new Error(`нет значения для варианта ${n.variant}`);
    c *= tRec.unit_factor;

    let D = n.depositionKBqPerM2;
    if (n.depositionDate && input.eatDate) {
      const halfRec = data.nuclides.find(r => r.nuclide === n.nuclide && r.recommended);
      if (halfRec) {
        const days = (new Date(input.eatDate) - new Date(n.depositionDate)) / 86400000;
        D *= decayFactor(halfRec.half_life_days, days);
        prov.push({ step: 'распад', what: 'период полураспада', id: halfRec.id, source: halfRec.source, loc: null, level: null, value: halfRec.half_life_days, unit: 'days' });
      }
    }
    rawBqPerKg = productFromDeposition(D, c);
    prov.push({ step: 'переход', what: tRec.item_ru, id: tRec.id, source: tRec.source, loc: tRec.loc, level: tRec.level, value: c, unit: 'm2/kg' });

    if (tRec.mass_basis === 'dry') {
      if (!Number.isFinite(input.dryMatterPercent)) throw new Error('коэффициент на сухую массу — нужно % сухого вещества');
      rawBqPerKg = dryToFresh(rawBqPerKg, input.dryMatterPercent);
    }
    // P-006: КП даёт активность исходного (свежего) продукта; сушёный концентрирует её в коэффициент усушки раз
    if (input.product?.state === 'dried') {
      if (!(Number.isFinite(input.dryingFactor) && input.dryingFactor >= 1)) throw new Error('сушёный продукт — нужен коэффициент усушки (≥ 1)');
      rawBqPerKg *= input.dryingFactor;
      prov.push({ step: 'усушка', what: 'коэффициент усушки', id: null, source: null, loc: null, level: null, value: input.dryingFactor, unit: '', note: 'активность свежего продукта × коэффициент усушки' });
    }
    basisNote(tRec, 'переход');
    if (tRec.level !== '✅' || tRec.source_anomaly) {
      warn(`коэффициент ${tRec.id}: уровень проверки ${tRec.level}${tRec.source_anomaly ? ', аномалия источника' : ''}`);
      prov.push({ step: 'переход', id: tRec.id, source: tRec.source, loc: tRec.loc, level: tRec.level, value: null, unit: null, note: tRec.source_anomaly || 'уровень не ✅' });
    }
  }

  // 2a. Обратная оценка плотности загрязнения места сбора по активности на дату отбора (не влияет на дозу)
  // #FR-33: основа массы КП не из прямого текста источника — предупреждение и строка провенанса с обоснованием
  function basisNote(tRec, step) {
    const st = tRec.mass_basis_status;
    if (st !== 'inferred' && st !== 'assumed') return;
    // #FR-44: «выведена косвенно» — число надёжное, основа следует из методики источника: пояснение в провенансе простыми словами, без жёлтого предупреждения;
    // «принята» — в источнике опоры нет, предупреждение остаётся
    const basis = tRec.mass_basis === 'dry' ? 'сухую' : 'свежую';
    if (st === 'assumed') warn(`КП ${tRec.item_ru || tRec.id}: в источнике не сказано, на какую массу он дан; принята ${basis} масса без опоры на текст источника`);
    const what = st === 'inferred' ? `в источнике прямо не сказано, на какую массу дан КП; принята ${basis} масса по методике автора` : `в источнике не сказано, на какую массу дан КП; принята ${basis} масса без опоры на текст`;
    prov.push({ step, id: tRec.id, source: tRec.source, loc: tRec.loc, level: st === 'assumed' ? '⚠️' : null, value: null, unit: null, note: `${what}. ${tRec.mass_basis_note}` });
  }
  let depEst = null;
  // #FR-45: относительная погрешность A (u/A в единицах пробы) — расширяет диапазон плотности
  const relA = n.source === 'measured' && n.measuredBqPerKg > 0 && Number.isFinite(n.measuredUncertaintyBqPerKg) ? n.measuredUncertaintyBqPerKg / n.measuredBqPerKg : 0;
  // #FR-31: сводная оценка — интервал D по всем записям КП продукта; без основы массы и не ✅ — не берутся
  if (n.source === 'measured' && n.transferId === 'ALL') {
    const recs = (n.transferIds || []).map(id => data.transfer.find(r => r.id === id)).filter(Boolean);
    // #FR-38: записи за год аварии (1986 — выпадения на поверхность растений) к многолетней оценке неприменимы
    const early = (r) => /1986/.test(`${r.item_ru} ${r.item}`);
    const used = recs.filter(r => r.mass_basis != null && r.level === '✅' && !r.source_anomaly && !early(r));
    const ests = used.flatMap(r => { try { return [depositionEstimate(atSampleBqPerKg, r, input.product?.state || 'fresh', input.dryMatterPercent, input.dryingFactor)]; } catch { return []; } });
    // одна точка на запись: центр КП, иначе среднее геометрическое её границ (разброс внутри записи не раздувает сводную)
    const point = (k) => k.central ?? (Number.isFinite(k.min) && Number.isFinite(k.max) ? Math.sqrt(k.min * k.max) : (k.min ?? k.max));
    const pts = ests.map(e => point(e.kBqPerM2)).filter(Number.isFinite).sort((x, y) => x - y);
    if (!pts.length) warn(`оценка загрязнения: нет проверенных записей КП (${recs.length} отброшено)`);
    else {
      const m = pts.length, median = m % 2 ? pts[(m - 1) / 2] : Math.sqrt(pts[m / 2 - 1] * pts[m / 2]);
      // #FR-46: границы — 1-й и 3-й квартили точек (средние 50 % оценок, интерполяция по логарифму); полный разброс — в summary
      const q = (p) => { const x = (m - 1) * p, i = Math.floor(x), f = x - i, a = pts[i], b = pts[Math.min(i + 1, m - 1)]; return a > 0 && b > 0 ? a * Math.pow(b / a, f) : a + (b - a) * f; };
      const min = q(0.25), max = q(0.75), ci = (v) => v / KBQ_PER_M2_PER_CI_PER_KM2;
      depEst = { transferId: 'ALL', summary: { used: ests.length, total: recs.length, sources: new Set(used.map(r => r.source)).size, fullMin: pts[0], fullMax: pts[m - 1],
          early: recs.filter(early).length,
          // #FR-33: сколько из взятых — с основой массы по выводу/допущению (не прямо из источника)
          notStated: used.filter(r => ests.some(e => e.transferId === r.id) && r.mass_basis_status && r.mass_basis_status !== 'stated').length },
        basis: null, activityOnBasis: null, coeffM2PerKg: { central: null, min: null, max: null },
        kBqPerM2: { central: median, min, max, unbounded: false }, ciPerKm2: { central: ci(median), min: ci(min), max: ci(max) } };
      depEst.range = depositionBounds(depEst.kBqPerM2, relA);
      // КП — из оценки (уже в м²/кг с учётом unit_factor), не сырое поле записи
      ests.forEach(e => { const r = used.find(x => x.id === e.transferId), c = e.coeffM2PerKg;
        prov.push({ step: 'оценка загрязнения (сводная)', what: r.item_ru, id: r.id, source: r.source, loc: r.loc, level: r.level, value: c.central ?? c.min ?? c.max, unit: 'm2/kg' }); });
    }
  } else if (n.source === 'measured' && n.transferId) {
    const tRec = data.transfer.find(r => r.id === n.transferId);
    if (!tRec) warn(`оценка загрязнения: нет записи перехода ${n.transferId}`);
    else {
      try {
        depEst = depositionEstimate(atSampleBqPerKg, tRec, input.product?.state || 'fresh', input.dryMatterPercent, input.dryingFactor);
        depEst.range = depositionBounds(depEst.kBqPerM2, relA);
        prov.push({ step: 'оценка загрязнения', what: tRec.item_ru, id: tRec.id, source: tRec.source, loc: tRec.loc, level: tRec.level, value: depEst.coeffM2PerKg.central ?? depEst.coeffM2PerKg.min ?? depEst.coeffM2PerKg.max, unit: 'm2/kg' });
        basisNote(tRec, 'оценка загрязнения');
        if (tRec.level !== '✅' || tRec.source_anomaly) warn(`оценка загрязнения: КП ${tRec.id}, уровень проверки ${tRec.level}`);
      } catch (e) {
        // сообщения ядра — на английском; пользователю — причина по-русски
        const dried = (input.product?.state || 'fresh') === 'dried' && !Number.isFinite(input.dryingFactor);
        warn(`оценка загрязнения не выполнена: ${dried ? 'для сушёного продукта не задан коэффициент усушки (вкладка «1 · Продукт и проба», поле «Коэффициент усушки»)' : e.message}`);
      }
    }
  }

  // 3. Processing
  // #FR-48: один или несколько способов обработки — в processing.js
  const frUsed = resolveProcessing(data.processing, input.processing, prov, warn);

  // 4-5. Calculations
  const eatenBqPerKg = rawBqPerKg; // Fr applied to intake mass
  const intakeBqPerYear = intakeBq(rawBqPerKg, input.portionKg * input.portionsPerYear, frUsed);
  const intakeBqTotal = intakeBqPerYear * input.years;
  const doseSvPerYear = committedDoseSv(intakeBqPerYear, dcRec.value);
  // #FR-65: при питании в интервале возрастов суммируем по возрастным группам
  let lifetimeBands = null, doseSvTotal = doseSvPerYear * input.years, eForPgp = dcRec.value;
  if (input.lifetime) {
    const eByAge = {};
    for (const b of AGE_BANDS) {
      const rec = pickDose(data.dose_coeff, n.nuclide, b.age, input.doseSource);
      if (rec) eByAge[b.age] = rec.value;
    }
    try {
      const lt = lifetimeDose(intakeBqPerYear, input.lifetime.fromAge, input.lifetime.toAge, eByAge);
      doseSvTotal = lt.doseSv; lifetimeBands = lt.bands;
      // ПГП в режиме «до 70 лет» — по взрослому коэффициенту (взрослым прожито почти всё время питания)
      if (eByAge.adult > 0) eForPgp = eByAge.adult;
    } catch (e) { throw new Error(`нет e(g) для расчёта по возрастным группам (${input.doseSource}): ${e.message}`); }
  }
  const riskTotal = riskFromDose(doseSvTotal, input.riskCoeffPerSv);
  // ПГП НРБ — от предела техногенного облучения; для природных нуклидов не определяется (НРБ п. 3.1.3, 5.3.1)
  const natural = isNatural(n.nuclide);
  const pgpBqPerYear = natural ? null : pgpFromDose(LIMIT_YEAR_SV, eForPgp);
  const pgpShare = natural ? null : intakeBqPerYear / pgpBqPerYear;

  return {
    nuclide: n.nuclide, natural, mode: n.source, rawBqPerKg, eatenBqPerKg, frUsed,
    intakeBqPerYear, intakeBqTotal, eSvPerBq: dcRec.value, doseSvPerYear, doseSvTotal, lifetimeBands, riskTotal, pgpBqPerYear, pgpShare, depositionEstimate: depEst, provenance: prov
  };
}

function pickDose(list, nuclide, age, source) {
  return list.find(r => r.nuclide === nuclide && r.age === age && (r.source === source || (source === 'NRB2009_App2' && r.source === 'NRB2009_App2a')));
}

function pickTransferValue(rec, variant) {
  if (variant === 'central') return Number.isFinite(rec.am) ? rec.am : rec.gm;
  if (variant === 'min') return rec.min;
  if (variant === 'max') return rec.max;
  return null;
}

function calcLimits(data, input, rows, warnings) {
  const ru = [];
  let hasDeposition = false;
  for (const r of rows) {
    if (r.nuclide === 'Cs-137' || r.nuclide === 'Sr-90') {
      if (!input.foodGroupCode) continue;
      // у группы может быть две записи: свежий и «значение в скобках (сухой продукт)» — выбор по состоянию продукта
      const lim = limitRecordFor(data.limits_ru, input.foodGroupCode, r.nuclide, input.product?.state || 'fresh');
      if (lim) ru.push({ nuclide: r.nuclide, limitId: lim.id, H: lim.value, unit: lim.unit, activity: r.rawBqPerKg, ratio: r.rawBqPerKg / lim.value, document: lim.document, loc: lim.loc });
      else {
        // #FR-32: прочерк в таблице норматива — «не нормируется», это не пробел данных и не предупреждение
        const dash = data.limits_ru.find(x => x.food_group_code === input.foodGroupCode && x.nuclide === r.nuclide && x.value == null);
        ru.push({ nuclide: r.nuclide, limitId: null, notNormed: !!dash, document: dash?.document, loc: dash?.loc });
        if (!dash) warnings.push(`нет предела для ${r.nuclide} в группе ${input.foodGroupCode}`);
      }
    }
    if (r.mode === 'deposition') hasDeposition = true;
  }

  let compliance = null;
  const itemsWithLim = ru.filter(x => x.limitId !== null);
  if (itemsWithLim.length > 0) {
    // da — неопределённость измерения (P = 0,95) только у измеренных значений; у расчётных 0 (см. предупреждение ниже)
    const daOf = (nuclide) => {
      const n = input.nuclides.find(q => q.nuclide === nuclide);
      return n && n.source === 'measured' && Number.isFinite(n.measuredUncertaintyBqPerKg) ? n.measuredUncertaintyBqPerKg : 0;
    };
    const items = itemsWithLim.map(x => ({ a: x.activity, da: daOf(x.nuclide), h: x.H }));
    if (hasDeposition) warnings.push("расчётная (не измеренная) активность: правило B ± ΔB применимо только к измеренным значениям");
    compliance = complianceB(items);
  }

  const EMERGENCY_DOC = /2016\/52|CXS 193|555\.880|560\.750/;
  // #FR-40: сила документа по полю status записи и юрисдикции
  const legalForce = (f) => {
    const st = String(f.status || '');
    if (/^заменён|утратил|истёк/i.test(st)) return { rank: 3, label: 'утратил силу' };
    // #FR-60: FDA DIL — ориентир для решения после аварии, не допустимый уровень и не предел для рынка
    // США, вода: MCL (40 CFR 141.66) и стандарт качества бутилированной воды (21 CFR 165.110) — обязательные нормы, не ориентиры
    if (/141\.66/.test(f.document)) return { rank: 0, label: 'обязательный для общественных систем водоснабжения (не для частных колодцев)' };
    if (/165\.110/.test(f.document)) return { rank: 0, label: 'обязательный стандарт качества бутилированной воды' };
    if (/555\.880/.test(f.document)) return { rank: 1, label: 'рекомендательный ориентир после аварии (не предел)' };
    if (/руководств|guidance|not establish legally/i.test(st) || f.jurisdiction === 'USA') return { rank: 1, label: 'руководство ведомства (не обязательно)' };
    if (/CXS 193/.test(f.document)) return { rank: 2, label: 'международная рекомендация, аварийные уровни для торговли' };
    if (f.jurisdiction === 'Codex' || f.jurisdiction === 'IAEA') return { rank: 2, label: 'международная рекомендация' };
    // Euratom 2016/52: потолки вводятся имплементирующим регламентом только при аварии (ст. 3(1))
    if (/2016\/52/.test(f.document)) return { rank: 0, label: 'обязательный акт — только при радиационной аварии' };
    return { rank: 0, label: 'обязательный государственный акт' };
  };
  const foreign = [];
  for (const r of rows) {
    // для воды добавлен Ra (MCL по 40 CFR 141.66(b)); 1 Бк/л принят равным 1 Бк/кг (плотность воды 1 кг/л)
    const isWater = input.foodGroupCode === 'water';
    if (r.nuclide.startsWith('Cs') || r.nuclide.startsWith('Sr') || (isWater && r.nuclide.startsWith('Ra'))) {
      const elem = r.nuclide.split('-')[0];
      for (const f of data.limits_foreign) {
        if (!Number.isFinite(f.value) || !(f.unit === 'Bq/kg' || (f.unit === 'Bq/L' && isWater))) continue;
        if (!appliesTo(f.food_category_ru, input.foodGroupCode)) continue; // только категория исследуемого продукта
        // нуклид записан либо именем («Cs-137»), либо группой ЕС («group: … notably Cs-134 and Cs-137»)
        // сравнивать по нуклиду, не по элементу: у Codex Sr-89 и Sr-90 в разных группах (1000 и 100 Бк/кг)
        // #FR-52: утратившие силу не показываются. #FR-60 (оператор «да»): аварийные уровни (Euratom 2016/52, Codex CXS 193, FDA DIL) показываются с пометкой силы документа
        if (legalForce(f).rank === 3) continue;
        if (f.nuclides.some(n => n === elem || n.includes(r.nuclide))) {
          foreign.push({ id: f.id, jurisdiction: f.jurisdiction, document: f.document, food_category_ru: f.food_category_ru, value: f.value, ratio: r.rawBqPerKg / f.value, sum_rule: f.sum_rule, loc: f.loc, force: legalForce(f), emergency: EMERGENCY_DOC.test(f.document) });
        }
      }
    }
  }
  // #FR-40: по силе документа — обязательные государственные акты вверху, утратившие силу внизу; внутри — строже выше
  foreign.sort((a, b) => a.force.rank - b.force.rank || a.value - b.value || a.jurisdiction.localeCompare(b.jurisdiction));

  return { ru, compliance, foreign, foreignClasses: productClasses(input.foodGroupCode) };
}
