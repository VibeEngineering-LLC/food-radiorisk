import {
  intakeBq, committedDoseSv, riskFromDose, pgpFromDose, decayFactor,
  productFromDeposition, dryToFresh, complianceB, VERDICT
} from './core.js';
import { productFromSample, depositionEstimate, depositionBounds, KBQ_PER_M2_PER_CI_PER_KM2 } from './sample.js';
import { classRank as classRankOf, classesFor } from './foodclass.js';
import { productEntry, normIdFor, matchProduct } from './products.js';
import { normCodeFor } from './catalog.js';
import { interventionLevels } from './intervention.js';
import { pickNormRecord, isP4, groupLabel, T044_PREFIX } from './norms.js';
import { resolveProcessing } from './processing.js';
import { isNatural, LIMIT_YEAR_SV, LIMIT_LIFE_SV } from './origin.js';
import { AGE_BANDS, periodYears } from './lifetime.js';
import { yearPlan, DAYS_PER_YEAR, NOMINAL_AGE, avg5, sumSeries } from './years.js';
import { yearlySeries, bandsOf } from './series.js';
import { buildComparison } from './compare.js';
import { organDoses } from './organ.js';
import { organRisk } from './organ_risk.js';
import { lifeRisks } from './life_risks.js';
import { isDryNorm, adjustForForm } from './form_norm.js';
import { makeLifeTable, causeProb, BG_CODE } from './life_table.js';
import { T, fill } from '../ui/texts_v.js';
import { checkDietInput, dietWarnText, dietProvenance, dietResult } from './diet.js';
import { checkInputRanges } from './input_check.js';
import { fmtDose2 } from '../ui/fmt.js';

/** порог дозы за год, выше которого линейная беспороговая модель не применяется: «около 100 мЗв» (МКРЗ, публикация 103, п. 64–65) */
const LNT_DOSE_LIMIT_SV = 0.1;

/** #FR-81 V01: коэффициент номинального риска — только из записи данных (НРБ-99/2009 п. 2.3), выбора и тихой константы нет */
export function riskCoeffOf(data) {
  const rec = (data.risk || []).find(r => r.id === 'nrb2009_p23_avg_risk_coeff' && Number.isFinite(r.value));
  if (!rec) throw Object.assign(new Error('нет коэффициента риска в данных'), { plain: true });
  return rec.value;
}

/** #FR-81 V07 (D-022): фон — вероятность умереть от новообразований (код ВОЗ 1026) от возраста a до конца жизни (b = ∞, решение В2); нет данных или возраст вне таблицы — null (строка на экране скрыта) */
export function backgroundOf(records, input) {
  const a = input.lifetime ? input.lifetime.fromAge : NOMINAL_AGE[input.age];
  const cs = (records || []).find(r => r.kind === 'cause_shares' && r.code === BG_CODE);
  if (!Number.isFinite(a) || !cs || !records.some(r => r.kind === 'life_table')) return null;
  try { return { a, code: BG_CODE, F: causeProb(makeLifeTable(records), BG_CODE, a, Infinity), year: cs.year }; } catch { return null; }
}

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
    diet: data.diet || [], // #FR-83: потребление по умолчанию
    products: data.products || [], // #FR-85: словарь продуктов (D-024)
    dryMatter: data.transfer.filter(r => r.quantity === 'dry_matter'),
    limitsRu: data.limits_ru,
    // #FR-81 E04: подпись группы — название её пункта Прил. 4, а не последней записи (служебной rule_*/hist_*)
    limitGroups: [...new Set(data.limits_ru.map(r => r.food_group_code))].map(code => ({ code, ru: groupLabel(code, data.limits_ru) }))
  };
}

// #FR-81 D18: дни от даты пробы (выпадений) до даты начала питания; питание не может начаться раньше пробы
function daysBetween(from, to, what) {
  const d = (new Date(to) - new Date(from)) / 86400000;
  if (!(d >= 0)) throw Object.assign(new Error(`Дата начала питания (${to}) раньше даты ${what} (${from}) или указана неверно — исправьте даты`), { plain: true });
  return d;
}

const NO_AGE_BANDS = 'В НРБ-99/2009 коэффициенты e(g) даны только для критической группы, а не по возрастам, поэтому режим «с возраста a до возраста b» недоступен. Выберите источник «МКРЗ (ICRP 119)»';

/** @param {object} data @param {object} input */
export function computeScenario(data, input) {
  const errors = [], warnings = [], rows = [];
  // #FR-65: питание «всю жизнь» — рацион одинаков во все годы, e(g) по возрасту в момент поступления
  // #FR-81 D-021: коэффициенты 4,1·10⁻² / 4,2·10⁻² (взрослые работники, МКРЗ 103 табл. 1) убраны из выбора — считаем население; предупреждение о них снято
  if (input.lifetime) warnings.push(`режим «${input.lifetime.fromAge}–${input.lifetime.toAge} лет»: рацион принят одинаковым во все годы, коэффициент e(g) берётся по возрастной группе в момент поступления (ICRP 119)`);
  // #FR-81 D14/D15: пустой или недопустимый срок и пустые поля рациона — ошибка ввода, а не молчаливая 1 и не доза 0
  // #FR-81 V11: вид продукта обязателен; неуказанный (undefined, вызов API) считается свежим
  if (input.product?.state !== undefined && !['fresh', 'dried', 'cooked'].includes(input.product.state)) errors.push(T.FORM_STATE_REQUIRED);
  // #FR-85 v11: название распознано частично и подтверждено пользователем — отметка в результате и отчёте (как ручной выбор группы)
  const pm = matchProduct(data.products, input.product?.name, input.product?.confirmId ?? null);
  if (pm.confirmed) warnings.push(fill(T.PRODUCT_CONFIRMED_WARN, { name: String(input.product.name).trim(), entry: pm.entry.name_ru, matched: pm.matchedWords.join(' '), rest: pm.uncovered.join(' ') }));
  // #FR-85 v13: слово состояния в названии («сушёные грибы») противоречит выбранному виду пробы — предупреждение (расчёт идёт по выбранному виду)
  if (pm.status === 'ok' && pm.stateInName && input.product?.state !== undefined && pm.stateInName !== input.product.state) warnings.push(fill(T.PRODUCT_STATE_CONFLICT, { name: String(input.product.name).trim(), named: T.PRODUCT_STATE_NAMES[pm.stateInName], chosen: T.PRODUCT_STATE_NAMES[input.product.state] }));
  const lt = input.lifetime;
  if (lt && !(Number.isFinite(lt.fromAge) && lt.fromAge >= 0 && Number.isFinite(lt.toAge) && lt.toAge > lt.fromAge && lt.toAge <= 120)) errors.push('Режим «с возраста a до возраста b»: укажите начальный возраст (не меньше 0) и конечный возраст — больше начального и не более 120 лет');
  else if (lt && !AGE_BANDS.every(b => data.dose_coeff.some(r => r.source === input.doseSource && r.age === b.age))) errors.push(NO_AGE_BANDS);
  else if (periodYears(input) === null) errors.push('Срок питания: укажите число лет от 1 до 120');
  // #FR-83 W06: потребление по умолчанию — ядро не верит числу формы, сверяет его с набором diet; нет значения — ошибка с причиной, а не «укажите массу порции»
  errors.push(...checkInputRanges(input)); // #FR-88 v18: огромные и недопустимые значения — сообщение, а не доза
  const dietCk = checkDietInput(data.diet, input, data.products);
  errors.push(...dietCk.errors);
  if (!dietCk.blocked && (!Number.isFinite(input.portionKg) || input.portionKg < 0)) errors.push('Рацион: укажите массу порции, г');
  if (!dietCk.blocked && (!Number.isFinite(input.portionsPerYear) || input.portionsPerYear < 0)) errors.push('Рацион: укажите, как часто едите продукт (раз в день, дней в неделю, недель в месяц, месяцев в году)');
  let riskCoeff = null;
  try { riskCoeff = riskCoeffOf(data); } catch (e) { errors.push(e.message); }
  if (errors.length > 0) return { ok: false, errors, warnings, rows, totals: {}, limits: {} };
  // #FR-81 P2-10: срок питания определяется ОДИН раз (periodYears) и дальше везде берётся из него: в режиме «с N до M» поле years игнорируется
  const period = { years: periodYears(input) };
  input = { ...input, years: period.years };
  for (const n of input.nuclides) {
    try { rows.push(rowFor(data, input, n, warnings, riskCoeff)); } catch (e) { errors.push(e.plain ? e.message : `${n.nuclide}: ${e.message}`); }
  }
  if (errors.length > 0) return { ok: false, errors, warnings, rows, totals: {}, limits: {} };
  // #FR-83 W06: умолчание всегда видно — предупреждение, шаг «рацион» в провенансе каждой строки нуклида, поле result.diet
  if (dietCk.rec) {
    warnings.push(dietWarnText(dietCk.rec, dietCk.group));
    for (const r of rows) r.provenance.unshift(dietProvenance(dietCk.rec, dietCk.group));
  }

  const doseY = rows.reduce((s, r) => s + (r.doseSvPerYear || 0), 0);
  const doseT = rows.reduce((s, r) => s + (r.doseSvTotal || 0), 0);
  const riskT = rows.reduce((s, r) => s + (r.riskTotal || 0), 0);
  // F3 (audit/risk-fields-review-2026-10-03.md): пределы НРБ — только для техногенной части
  const lim0 = doseLimits(data); // #FR-81 D20: пределы 1 и 70 мЗв и порог 10 мкЗв — из набора risk
  const tech = rows.filter(r => !r.natural);
  // #FR-81 D13: пределы доз и ПГП — только для техногенных нуклидов (НРБ-99/2009 п. 3.1.3); природные показаны, но не нормируются
  const nat = rows.filter(r => r.natural).map(r => r.nuclide);
  if (nat.length) warnings.push(`для природных нуклидов (${nat.join(', ')}) предел 1 мЗв/год и ПГП не применяются (НРБ-99/2009 п. 3.1.3); их доза и риск показаны, в долю предела и в ПГП не входят`);
  // #FR-81 D08: пометка на экране (формулировка оператора 05.10)
  if (!input.constantActivity && period.years > 1) warnings.push('Многолетнее питание: учтён только радиоактивный распад; очищение почвы и продуктов не учтено — оценка консервативна. Для лесных грибов и ягод активность новых урожаев может не снижаться — отметьте «активность постоянна».');
  // #FR-81 D10: ряды доз по годам; Ē₅ — наибольшая средняя за 5 лет подряд (окно с нулями за пределами срока), максимум года — для предела 5 мЗв
  const yearsAll = sumSeries(rows.map(r => r.yearly.map(y => y.doseSv))), yearsTech = sumSeries(tech.map(r => r.yearly.map(y => y.doseSv)));
  const doseAvg5 = avg5(yearsAll), techAvg5 = avg5(yearsTech), doseMaxYear = Math.max(...yearsAll), techMaxYear = Math.max(0, ...yearsTech);
  const techY = tech.reduce((s, r) => s + (r.doseSvPerYear || 0), 0);
  const techT = tech.reduce((s, r) => s + (r.doseSvTotal || 0), 0);

  // #FR-88 v22 (D-7): выше ~100 мЗв в год линейная беспороговая модель не применима (МКРЗ, публикация 103, 2007, п. 64–65: «below about 100 mSv»)
  if (doseMaxYear > LNT_DOSE_LIMIT_SV) warnings.push(fill(T.LNT_WARN, { E: fmtDose2(doseMaxYear) }));
  const limits = calcLimits(data, input, rows, warnings);

  // #FR-81 V02 (D-022): главное число R = r·ΣE_k по техногенным нуклидам за весь срок; словесная оценка — по дозе самого нагруженного года (техногенные)
  const riskY = rows.length ? riskFromDose(doseY, riskCoeff) : 0; // риск от поступления первого года
  const maxIdx = tech.length ? yearsTech.indexOf(techMaxYear) : -1;
  const doseClass = tech.length ? doseClassOf(techMaxYear, lim0) : null;
  const uniformYears = tech.length > 0 && yearsTech.every(v => Math.abs(v - techMaxYear) <= 1e-9 * techMaxYear);

  const organs = rows.length ? organDoses(rows, input, data.organ_dose) : null; // #FR-75
  const result = {
    ok: true, errors, warnings, rows, period,
    totals: {
      doseSvPerYear: rows.length ? doseY : null,
      doseSvTotal: rows.length ? doseT : null,
      riskTotal: rows.length ? riskT : null,
      riskPerYear: rows.length ? riskY : null,
      doseSvAvg5: rows.length ? doseAvg5 : null, doseSvMaxYear: rows.length ? doseMaxYear : null,
      riskNominal: tech.length ? riskFromDose(techT, riskCoeff) : null, // R: смерть от рака, номинально, техногенные нуклиды, весь срок
      doseMaxYearTech: tech.length ? techMaxYear : null, doseMaxYearIndex: maxIdx >= 0 ? maxIdx + 1 : null,
      doseMaxYearAge: maxIdx >= 0 && input.lifetime ? input.lifetime.fromAge + maxIdx : null, doseMaxYearUniform: uniformYears,
      doseTechAvg5: tech.length ? techAvg5 : null, doseClass, riskMaxYear: tech.length ? riskFromDose(techMaxYear, riskCoeff) : null, maxYearShare5mSv: tech.length ? techMaxYear / 5e-3 : null,
      techDoseSvPerYear: tech.length ? techY : null,
      techDoseSvTotal: tech.length ? techT : null,
      techNuclides: tech.map(r => r.nuclide),
      naturalNuclides: rows.filter(r => r.natural).map(r => r.nuclide),
      budgetShareMaxYear: tech.length ? techMaxYear / lim0.yearSv : null, budgetShare1mSvAvg5: tech.length ? techAvg5 / lim0.yearSv : null,
      lifeShare70mSv: tech.length ? techT / lim0.lifeSv : null,
      optimNegligibleSv: lim0.optimNegligibleSv, optimNegligibleLoc: lim0.optimNegligibleLoc, limitYearSv: lim0.yearSv, limitYearLoc: lim0.yearLoc, limitLifeLoc: lim0.lifeLoc
    },
    limits,
    diet: dietCk.rec ? dietResult(input.diet.mode, dietCk.rec, dietCk.group, dietCk.manual) : null, // #FR-83 W06
    // #FR-73: сравнение с другими источниками облучения
    comparison: rows.length ? buildComparison(data.compare, { doseSvPerYear: doseY, doseSvTotal: doseT, naturalNuclides: rows.filter(r => r.natural).map(r => r.nuclide) }, input, riskCoeff) : null,
    organs, organRisk: rows.length ? organRisk(rows, input, data.organ_risk, organs, riskCoeff) : null
  };
  // #FR-79: добавочный риск от продукта рядом с обычными рисками жизни (data-src/life_risks.yaml); считается по готовому результату
  result.lifeRisks = rows.length ? lifeRisks(result, input, data.life_risks) : null;
  // #FR-81 V07: строка A4 главного экрана
  result.background = tech.length ? backgroundOf(data.life_risks, input) : null;
  return result;
}

function rowFor(data, input, n, warnings, riskCoeff) {
  const prov = [];
  const warn = (msg) => warnings.push(`${n.nuclide}: ${msg}`);
  // 1. Dose coeff
  // #FR-81 D05: прил. 2а НРБ — коэффициенты для ПИТЬЕВОЙ ВОДЫ; для пищи берётся только прил. 2
  const isWater = input.foodGroupCode === 'water';
  const dcRec = pickDose(data.dose_coeff, n.nuclide, input.age, input.doseSource, isWater);
  if (!dcRec) throw doseMissing(data.dose_coeff, n.nuclide, input.age, input.doseSource, isWater);
  prov.push({ step: 'доза', what: `коэффициент ожидаемой эффективной дозы при поступлении с ${dcRec.source === 'NRB2009_App2a' ? 'питьевой водой (НРБ-99/2009, прил. 2а)' : 'пищей'}`, id: dcRec.id, source: dcRec.source, loc: dcRec.loc, level: dcRec.level, value: dcRec.value, unit: dcRec.unit });

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
        const days = daysBetween(n.sampleDate, input.eatDate, 'пробы');
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
        const days = daysBetween(n.depositionDate, input.eatDate, 'выпадений');
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
    // P-006: КП даёт активность исходного (свежего) продукта; сушёный концентрирует её в K раз (коэффициент концентрирования при сушке)
    if (input.product?.state === 'dried') {
      if (!(Number.isFinite(input.dryingFactor) && input.dryingFactor >= 1)) throw new Error('сушёный продукт — нужен коэффициент концентрирования при сушке (≥ 1)');
      rawBqPerKg *= input.dryingFactor;
      prov.push({ step: 'концентрирование при сушке', what: 'коэффициент концентрирования при сушке', id: null, source: null, loc: null, level: null, value: input.dryingFactor, unit: '', note: 'активность свежего продукта × коэффициент концентрирования при сушке' });
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
  // #FR-81 D22: u — в единицах ПРОДУКТА (A пробы / K), поэтому делим на A продукта, а не на A пробы
  const relA = n.source === 'measured' && atSampleBqPerKg > 0 && Number.isFinite(n.measuredUncertaintyBqPerKg) ? n.measuredUncertaintyBqPerKg / atSampleBqPerKg : 0;
  // #FR-31: сводная оценка — интервал D по всем записям КП продукта; без основы массы и не ✅ — не берутся
  if (n.source === 'measured' && n.transferId === 'ALL') {
    const recs = (n.transferIds || []).map(id => data.transfer.find(r => r.id === id)).filter(Boolean);
    // #FR-38: записи за год аварии (1986 — выпадения на поверхность растений) к многолетней оценке неприменимы
    const early = (r) => /1986/.test(`${r.item_ru} ${r.item}`);
    const used = recs.filter(r => r.mass_basis != null && r.level === '✅' && !r.source_anomaly && !early(r));
    const ests = used.flatMap(r => { try { return [depositionEstimate(atSampleBqPerKg, r, input.product?.state === 'dried' ? 'dried' : 'fresh', input.dryMatterPercent, input.dryingFactor)]; } catch { return []; } });
    // одна точка на запись: центр КП, иначе среднее геометрическое её границ (разброс внутри записи не раздувает сводную)
    // #FR-88 v20 (D-029, V-3): запись без центра и только с нижней границей КП (k.max — плотность по min КП) не используется; только с верхней границей КП (k.min) — точка = она
    const point = (k) => k.central ?? (Number.isFinite(k.min) && Number.isFinite(k.max) ? Math.sqrt(k.min * k.max) : k.min);
    ests.splice(0, ests.length, ...ests.filter(e => Number.isFinite(point(e.kBqPerM2)))); // запись без точки не используется (в «использовано» и происхождении её нет)
    const pts = ests.map(e => point(e.kBqPerM2)).sort((x, y) => x - y);
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
        depEst = depositionEstimate(atSampleBqPerKg, tRec, input.product?.state === 'dried' ? 'dried' : 'fresh', input.dryMatterPercent, input.dryingFactor);
        depEst.range = depositionBounds(depEst.kBqPerM2, relA);
        prov.push({ step: 'оценка загрязнения', what: tRec.item_ru, id: tRec.id, source: tRec.source, loc: tRec.loc, level: tRec.level, value: depEst.coeffM2PerKg.central ?? depEst.coeffM2PerKg.min ?? depEst.coeffM2PerKg.max, unit: 'm2/kg' });
        basisNote(tRec, 'оценка загрязнения');
        if (tRec.level !== '✅' || tRec.source_anomaly) warn(`оценка загрязнения: КП ${tRec.id}, уровень проверки ${tRec.level}`);
      } catch (e) {
        // сообщения ядра — на английском; пользователю — причина по-русски
        const dried = (input.product?.state || 'fresh') === 'dried' && !Number.isFinite(input.dryingFactor);
        warn(`оценка загрязнения не выполнена: ${dried ? 'для сушёного продукта не задан коэффициент концентрирования при сушке (вкладка «1 · Продукт и проба», поле «Коэффициент концентрирования при сушке»)' : e.message}`);
      }
    }
  }

  // 3. Processing
  // #FR-48: один или несколько способов обработки — в processing.js
  // #FR-81 V11: готовое блюдо — обработка уже учтена в измерении, Fr = 1 независимо от выбранного способа
  const cooked = input.product?.state === 'cooked';
  if (cooked && input.processing && input.processing.mode !== 'none') warn('готовое блюдо: обработка не применяется (Fr = 1)');
  const frUsed = cooked ? 1 : resolveProcessing(data.processing, input.processing, prov, warn, n.nuclide);

  // 4-5. Calculations
  const eatenBqPerKg = rawBqPerKg; // Fr applied to intake mass
  // #FR-81 D08: поступление года k — A₀·m·Fr с физическим распадом продукта (среднее за год); доза = Σ_k I_k·e(g_k)
  const intakeStart = intakeBq(rawBqPerKg, input.portionKg * input.portionsPerYear, frUsed); // Бк/год на начало питания
  const hl = data.nuclides.find(r => r.nuclide === n.nuclide && r.recommended); // тот же период полураспада, что у поправки от даты пробы
  const T = hl && !input.constantActivity ? hl.half_life_days / DAYS_PER_YEAR : null;
  if (T && input.years > 1) prov.push({ step: 'распад по годам', what: 'период полураспада', id: hl.id, source: hl.source, loc: null, level: null, value: hl.half_life_days, unit: 'days' });
  const eByAge = {};
  for (const b of AGE_BANDS) { const rec = pickDose(data.dose_coeff, n.nuclide, b.age, input.doseSource); if (rec) eByAge[b.age] = rec.value; }
  // #FR-81 D09: e(g) по возрасту в каждом году — если у источника есть все шесть групп; иначе (НРБ: только критическая группа) один коэффициент на весь срок
  const sixBands = AGE_BANDS.every(b => eByAge[b.age] > 0);
  const startAge = input.lifetime ? input.lifetime.fromAge : sixBands ? (NOMINAL_AGE[input.age] ?? null) : null;
  const plan = yearPlan({ years: input.years, halfLifeYears: T, startAge });
  let yearly = yearlySeries({ plan, intakeStart, eByAge, eDefault: dcRec.value, label: n.nuclide });
  // #FR-81 (метод, шаг 4а): Y-90, уже бывший в продукте при Sr-90 (равновесие), — отдельное поступление со своим e(g); Fr и распад те же, что у Sr-90 (допущение метода)
  let y90 = null;
  if (n.nuclide === 'Sr-90') {
    const eY = {};
    for (const b of AGE_BANDS) { const rec = pickDose(data.dose_coeff, 'Y-90', b.age, input.doseSource); if (rec) eY[b.age] = rec.value; }
    if (AGE_BANDS.every(b => eY[b.age] > 0) && yearly.every(y => y.band)) {
      const ys = yearlySeries({ plan, intakeStart, eByAge: eY, eDefault: null, label: 'Y-90' });
      y90 = { included: !!input.includeY90, doseSvPerYear: ys[0].doseSv, doseSvTotal: ys.reduce((s, y) => s + y.doseSv, 0), ratio: ys[0].eSvPerBq / yearly[0].eSvPerBq };
      if (input.includeY90) yearly = yearly.map((y, i) => ({ ...y, eSvPerBq: y.eSvPerBq + ys[i].eSvPerBq, doseSv: y.doseSv + ys[i].doseSv }));
    }
  }
  // #FR-81: ПГП — по группе года с наибольшей дозой (критическая группа среди прожитых), а не по взрослому: у Sr-90 взрослый коэффициент в 2,86 раза ниже коэффициента 12–17 лет
  const worst = yearly.reduce((a, b) => b.doseSv > a.doseSv ? b : a);
  const eForPgp = worst.eSvPerBq;
  const intakeBqPerYear = yearly[0].intakeBq;
  const intakeBqTotal = yearly.reduce((s, y) => s + y.intakeBq, 0);
  const doseSvPerYear = yearly[0].doseSv;
  const doseSvTotal = yearly.reduce((s, y) => s + y.doseSv, 0);
  const lifetimeBands = input.lifetime ? bandsOf(yearly) : null;
  const riskTotal = riskFromDose(doseSvTotal, riskCoeff);
  // ПГП НРБ — от предела техногенного облучения; для природных нуклидов не определяется (НРБ п. 3.1.3, 5.3.1)
  const natural = isNatural(n.nuclide);
  const pgpBqPerYear = natural ? null : pgpFromDose(doseLimits(data).yearSv, eForPgp);
  const pgpShare = natural ? null : worst.intakeBq / pgpBqPerYear;

  return {
    nuclide: n.nuclide, natural, mode: n.source, rawBqPerKg, eatenBqPerKg, frUsed,
    intakeBqPerYear, intakeBqTotal, eSvPerBq: dcRec.value, doseSvPerYear, doseSvTotal, yearly, y90, lifetimeBands, riskTotal, pgpBqPerYear, pgpShare, depositionEstimate: depEst, provenance: prov
  };
}

// ключ «один документ — одна группа нуклидов»: номер акта (2016/52, CXS 193, 555.880 …) и список нуклидов записи
function foreignKey(f) {
  const doc = String(f.document).match(/\d{4}\/\d+|CXS \d+|\d{3}\.\d{3}|\d+ CFR [\d.]+|No \d+\/\d+/)?.[0] ?? f.document;
  return `${f.jurisdiction}|${doc}|${f.nuclides.join(',')}`;
}

// #FR-81 D20: пределы доз НРБ-99/2009 из набора risk (мЗв, мкЗв → Зв); нет записи — константы origin.js
function doseLimits(data) {
  const rec = (id) => (data.risk || []).find(r => r.id === id && Number.isFinite(r.value));
  const y = rec('nrb2009_t31_dose_limit_pop'), l = rec('nrb2009_p314_lifetime_dose_pop'), o = rec('osporb2010_optimization_negligible');
  // #FR-81 V02: 10 мкЗв/год — ОСПОРБ-99/2010 прил. 1 (принцип оптимизации), а не НРБ п. 1.4 (критерий изъятия источника)
  return { yearSv: y ? y.value / 1e3 : LIMIT_YEAR_SV, yearLoc: y?.loc ?? null, lifeSv: l ? l.value / 1e3 : LIMIT_LIFE_SV, lifeLoc: l?.loc ?? null, optimNegligibleSv: o ? o.value / 1e6 : 1e-5, optimNegligibleLoc: o?.loc ?? null };
}

/** #FR-81 V02: класс словесной оценки по дозе самого нагруженного года: c1 ≤ 10 мкЗв < c2 ≤ 1 мЗв < c3 (границы входят в нижний класс) */
export function doseClassOf(doseSv, lim) {
  return doseSv <= lim.optimNegligibleSv ? 'c1' : doseSv <= lim.yearSv ? 'c2' : 'c3';
}

function pickDose(list, nuclide, age, source, water = false) {
  const hits = list.filter(r => r.nuclide === nuclide && r.age === age && (r.source === source || (source === 'NRB2009_App2' && water && r.source === 'NRB2009_App2a')));
  return (water && hits.find(r => r.source === 'NRB2009_App2a')) || hits[0];
}

const AGE_RU = { '3m': '3 месяца', '1y': '1 год', '1-2y': '1–2 года', '5y': '5 лет', '10y': '10 лет', '12-17y': '12–17 лет', '15y': '15 лет', adult: 'взрослый' };
// #FR-81 D04: нет e(g) — сообщение пользователю без внутренних кодов; коэффициент соседней группы не подставляется (D-020)
function doseMissing(list, nuclide, age, source, water) {
  let msg = `нет коэффициента e(g) для ${nuclide} (возраст «${AGE_RU[age] || age}»)`;
  if (source === 'NRB2009_App2') {
    const have = [...new Set(list.filter(r => r.nuclide === nuclide && (r.source === source || (water && r.source === 'NRB2009_App2a'))).map(r => AGE_RU[r.age] || r.age))];
    msg = `В НРБ-99/2009 (прил. 2) для возраста «${AGE_RU[age] || age}» коэффициента для ${nuclide} нет: документ даёт его только для критической группы${have.length ? ` («${have.join('», «')}»)` : ' (для этого нуклида в документе значения нет)'}. Выберите источник «МКРЗ (ICRP 119)»`;
  }
  return Object.assign(new Error(msg), { plain: true });
}

function pickTransferValue(rec, variant) {
  if (variant === 'central') return Number.isFinite(rec.am) ? rec.am : rec.gm;
  if (variant === 'min') return rec.min;
  if (variant === 'max') return rec.max;
  return null;
}

/** #FR-81 V4-1: нуклид назван в элементе списка nuclides записи нормы целиком («Pu-239», «H-3 (organically bound)», «…notably I-131»), а не как часть другого имени */
export const inItem = (item, nuclide) => new RegExp(`(^|[^A-Za-z0-9-])${nuclide}(?![0-9])`).test(item);

function calcLimits(data, input, rows, warnings) {
  const ru = [];
  let hasDeposition = false;
  // #FR-81 P2-1: вода — показатель B по ТР ЕАЭС 044/2017 табл. 4 (все нуклиды таблицы), остальное — Cs-137/Sr-90 по Прил. 4
  const isWaterB = input.foodGroupCode === 'water';
  // #FR-85: строку норматива и классы Codex/EU задаёт запись словаря продуктов (data.products), а не разбор названия
  const prodEntry = productEntry(data.products, input.product?.name, input.product?.confirmId ?? null);
  const pstate = input.product?.state || 'fresh';
  const normOf = (n) => normIdFor(prodEntry, pstate, n);
  const t044 = (n) => data.limits_ru.some(x => x.food_group_code === 'water' && x.id.startsWith(T044_PREFIX) && x.nuclide === n && Number.isFinite(x.value));
  for (const r of rows) {
    if (r.nuclide === 'Cs-137' || r.nuclide === 'Sr-90' || (isWaterB && t044(r.nuclide))) {
      if (!input.foodGroupCode) continue;
      // у группы может быть две записи: свежий и «значение в скобках (сухой продукт)» — выбор по состоянию продукта
      // #FR-81 D02/E01: B считается только по ТР ТС 021/2011 Прил. 4; пункт внутри группы — по названию продукта
      const { rec: lim, ambiguous, needsK } = pickNormRecord(data.limits_ru, input.foodGroupCode, r.nuclide, normOf(r.nuclide), pstate, { activity: r.rawBqPerKg, K: input.dryingFactor });
      if (lim) {
        ru.push({ nuclide: r.nuclide, needsK: !!needsK, limitId: lim.id, groupRu: lim.food_group_ru, dryNorm: isDryNorm(lim), H: lim.value, unit: lim.unit, activity: r.rawBqPerKg, ratio: r.rawBqPerKg / lim.value, document: lim.document, loc: lim.loc });
        if (ambiguous) warnings.push(`${r.nuclide}: в группе несколько норм Прил. 4 ТР ТС 021/2011, по названию продукта пункт не определён — взята ${needsK && Number.isFinite(input.dryingFactor) ? 'строка с наибольшим показателем B после пересчёта на K' : 'самая строгая'} (${lim.value} Бк/кг, «${lim.food_group_ru}»); уточните название продукта`);
      } else {
        // #FR-32: прочерк в таблице норматива — «не нормируется», это не пробел данных и не предупреждение
        // #FR-85 v11: строка словаря из другого регламента этой группы (ТР ТС 015) — справочно она сама, прочерк Прил. 4 не берётся
        const own = data.limits_ru.find(x => x.id === normOf(r.nuclide) && !isP4(x) && x.food_group_code === input.foodGroupCode && Number.isFinite(x.value) && x.value > 0) || null;
        const dash = own ? null : data.limits_ru.find(x => isP4(x) && x.food_group_code === input.foodGroupCode && x.nuclide === r.nuclide && x.value == null);
        // нормы других регламентов (ТР ТС 015, 033, ТР ЕАЭС 044) — справочно, в B не входят
        const ref = dash ? null : own || data.limits_ru.find(x => !isP4(x) && x.food_group_code === input.foodGroupCode && x.nuclide === r.nuclide && Number.isFinite(x.value) && x.value > 0 && /^t\d+_/.test(x.id));
        ru.push({ nuclide: r.nuclide, limitId: null, notNormed: !!dash, document: dash?.document, loc: dash?.loc, reference: ref ? { H: ref.value, unit: ref.unit, document: ref.document, loc: ref.loc, note: /^t015_grain_/.test(ref.id) ? "документ на зерно, не на пищевой продукт" : null } : null });
        if (!dash) warnings.push(`${r.nuclide}: в ТР ТС 021/2011 Прил. 4 для этой группы нормы нет${ref ? `; значение другого регламента (${ref.value} Бк/кг, ${String(ref.document).split(/\s[«(]/)[0]}) показано справочно и в B не входит${/^t015_grain_/.test(ref.id) ? '; документ на зерно, не на пищевой продукт' : ''}` : ''}`);
      }
    }
    if (r.mode === 'deposition') hasDeposition = true;
  }

  // #FR-81 V10: вердикт B — по форме продукта, к которой относится норматив (сушёный без своего норматива — пересчёт A/K; без K и готовое блюдо — вердикта нет)
  const adj = adjustForForm(ru, input);
  ru.splice(0, ru.length, ...adj.ru);
  let compliance = null;
  const itemsWithLim = ru.filter(x => x.limitId !== null);
  if (itemsWithLim.length > 0 && adj.note?.kind !== 'no_k') {
    // da — неопределённость измерения (P = 0,95) только у измеренных значений; у расчётных 0 (см. предупреждение ниже)
    const daOf = (nuclide) => {
      const n = input.nuclides.find(q => q.nuclide === nuclide);
      return n && n.source === 'measured' && Number.isFinite(n.measuredUncertaintyBqPerKg) ? n.measuredUncertaintyBqPerKg : 0;
    };
    const items = itemsWithLim.map(x => ({ a: x.activity, da: daOf(x.nuclide) / (x.converted?.K ?? 1), h: x.H }));
    if (hasDeposition) warnings.push("расчётная (не измеренная) активность: правило B ± ΔB применимо только к измеренным значениям");
    compliance = complianceB(items);
    // #FR-81 E11: B = A/H по Cs-137 + A/H по Sr-90 (МУК п. 6.1, СанПиН п. 3.20): не введён нормируемый нуклид — B неполон
    const required = isWaterB ? data.limits_ru.filter(x => x.food_group_code === 'water' && x.id.startsWith(T044_PREFIX) && Number.isFinite(x.value)).map(x => x.nuclide) : ['Cs-137', 'Sr-90'];
    const missing = required.filter(n => !rows.some(r => r.nuclide === n) && pickNormRecord(data.limits_ru, input.foodGroupCode, n, normOf(n), pstate).rec);
    // #FR-88 v22 (D-7б): оговорка про «соответствует» нужна только при вердикте «соответствует»; при «не соответствует» превышение не зависит от недостающих нуклидов
    const incompleteTail = compliance.verdict === 'nonconforms' ? '' : '; вердикт «соответствует» неполон';
    if (missing.length && isWaterB) warnings.push(`B рассчитан не по всем нормируемым нуклидам: не введены ${missing.join(', ')} (ТР ЕАЭС 044/2017, табл. 4: условие — сумма A/УВ по всем радионуклидам таблицы ≤ 1)${incompleteTail}`);
    else if (missing.length) warnings.push(`B рассчитан не по всем нормируемым нуклидам: не введён ${missing.join(', ')} (МУК 2.6.1.1194-03 п. 6.1, СанПиН 2.3.2.1078-01 п. 3.20: B = A/H по цезию-137 + A/H по стронцию-90)${incompleteTail}`);
  }

  const EMERGENCY_DOC = /2016\/52|CXS 193|555\.880|560\.750/;
  // #FR-40: сила документа по полю status записи и юрисдикции
  const legalForce = (f) => {
    const st = String(f.status || '');
    if (/^(заменён|утратил|истёк)/i.test(st)) return { rank: 3, label: 'утратил силу' };
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
  let foreign = [];
  // #FR-81 E08: зарубежные нормы относятся к продукту в готовом (восстановленном) виде — активность сухого продукта делится на коэффициент концентрирования при сушке
  const dried = input.product?.state === 'dried';
  const recon = dried && Number.isFinite(input.dryingFactor) && input.dryingFactor >= 1 ? input.dryingFactor : 1;
  const pcs = classesFor(prodEntry, normCodeFor(data.limits_ru, prodEntry, pstate), input.foodGroupCode);
  for (const r of rows) {
    // для воды добавлен Ra (MCL по 40 CFR 141.66(b)); 1 Бк/л принят равным 1 Бк/кг (плотность воды 1 кг/л)
    // #FR-88 v19 (D-029, А-1): вода не из упаковки (кран, колодец) — группы норм ТР ЕАЭС нет, но класс продукта по словарю тот же (water): зарубежные нормы в Бк/л применяются так же
    const isWater = input.foodGroupCode === 'water' || pcs.includes('water');
    // #FR-81 V4-1: любой нуклид, названный в записи нормы (I-131, Pu-239, Ru-106 …), входит в групповую сумму; отбор — по полю nuclides записи, а не по элементу
    {
      const elem = r.nuclide.split('-')[0];
      for (const f of data.limits_foreign) {
        if (!Number.isFinite(f.value) || !(f.unit === 'Bq/kg' || (f.unit === 'Bq/L' && isWater))) continue;
        const classRank = classRankOf(f.food_category_ru, pcs); // #FR-81 E09: 0 — самая узкая категория продукта
        if (classRank < 0) continue; // только категория исследуемого продукта
        // нуклид записан либо именем («Cs-137»), либо группой ЕС («group: … notably Cs-134 and Cs-137»)
        // сравнивать по нуклиду, не по элементу: у Codex Sr-89 и Sr-90 в разных группах (1000 и 100 Бк/кг)
        // #FR-52: утратившие силу не показываются. #FR-60 (оператор «да»): аварийные уровни (Euratom 2016/52, Codex CXS 193, FDA DIL) показываются с пометкой силы документа
        if (legalForce(f).rank === 3) continue;
        if (f.nuclides.some(n => n === elem || inItem(n, r.nuclide))) {
          foreign.push({ id: f.id, jurisdiction: f.jurisdiction, document: f.document, food_category_ru: f.food_category_ru, value: f.value, ratio: r.rawBqPerKg / recon / f.value, nuclides: [r.nuclide], activity: r.rawBqPerKg / recon, reconstitution: recon, perNuclide: /^iaea_tecdoc1788/.test(f.id), sum_rule: f.sum_rule, loc: f.loc, force: legalForce(f), emergency: EMERGENCY_DOC.test(f.document), classRank, key: foreignKey(f) });
        }
      }
    }
  }
  // #FR-81 E07: нормы групповые — активности нуклидов группы (Cs-134 + Cs-137 …) СКЛАДЫВАЮТСЯ и сравниваются с одним значением; одна строка на запись нормы.
  // Исключение — уровни ВОЗ (TECDOC-1788): каждый нуклид строки сравнивается со своим уровнем
  const merged = new Map();
  for (const e of foreign) {
    const k = e.perNuclide ? `${e.id}|${e.nuclides[0]}` : e.id, p = merged.get(k);
    if (p) { p.activity += e.activity; p.nuclides.push(...e.nuclides); } else merged.set(k, { ...e, nuclides: [...e.nuclides] });
  }
  foreign = [...merged.values()].map(e => ({ ...e, ratio: e.activity / e.value }));
  if (dried && recon === 1 && foreign.length) warnings.push('зарубежные нормы заданы для продукта в готовом (восстановленном) виде (Codex CXS 193 стр. 50; FDA CPG 555.880 сн. b; Euratom 2016/52 прил. I сн. 1), а продукт введён сушёным. Коэффициент из подсказки ТР ТС (он для норм РФ) в зарубежное сравнение сам не подставляется: введите его в поле «Коэффициент концентрирования при сушке» — пока поле пусто, пересчёта на готовый вид нет и A/норматив завышен');
  // #FR-81 E09: в одном документе для одной группы нуклидов действует норма самой узкой категории продукта (молоко — молочная, а не «прочие»)
  const best = new Map();
  for (const e of foreign) best.set(e.key, Math.min(best.get(e.key) ?? Infinity, e.classRank));
  foreign = foreign.filter(e => e.classRank === best.get(e.key));
  // #FR-40: по силе документа — обязательные государственные акты вверху, утратившие силу внизу; внутри — строже выше
  foreign.sort((a, b) => a.force.rank - b.force.rank || a.value - b.value || a.jurisdiction.localeCompare(b.jurisdiction));

  // #FR-81 V10: для готового блюда зарубежные нормы не показываются (нормы заданы для продукта, а не для блюда)
  if (input.product?.state === 'cooked') foreign = [];
  // #FR-85 v11: у распознанного продукта нет строки норматива РФ (садовые фрукты, яйца …) — в результате «норматив РФ не установлен», а не «выберите группу»
  const ruNone = !!prodEntry && !normIdFor(prodEntry, 'fresh') && !normIdFor(prodEntry, 'dried');
  // #FR-85 v14 п. 7: вода колодцев и скважин — не упакованная; норматива B нет, сравнение с уровнями вмешательства НРБ-99/2009 Прил. 2а
  const intervention = prodEntry?.intervention === 'nrb2009_app2a' ? interventionLevels(data.dose_coeff, rows) : null;
  return { ru, compliance, foreign, foreignClasses: pcs, formNote: adj.note, ruNone, intervention, productName: prodEntry?.name_ru ?? null, productCaption: prodEntry?.caption ?? null };
}
