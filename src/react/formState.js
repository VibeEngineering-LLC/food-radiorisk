import { buildInput, doseSourceOptions, agesFor, processingOptions, kFor, perMonth, numOrNull, SOURCE_SHORT } from '../ui/form.js';
import { transferOptions, TUM_HINT } from '../ui/product.js';
import { summaryOffered } from '../ui/form.js';
import { categoryOf, limitGroupFor, dryMatterFor, dryingFactorFor } from '../calc/catalog.js';
import { fmtNum } from '../ui/fmt.js';

export function foodGroupOptions(choices) {
  const opts = [{ value: '', label: '— не сравнивать —' }];
  for (const g of choices.limitGroups) {
    if (!g.ru || g.ru === '—' || g.code === 'other') continue;
    opts.push({ value: g.code, label: g.ru });
  }
  return opts;
}

export function newNuclide(nuclide) {
  return { nuclide, source: 'measured', measured: '', unc: '0', sampleDate: '', dep: '', depDate: '', transfer: '', transferPicked: false, variant: 'central' };
}

export function fixAge(raw, choices) {
  const opts = agesFor(choices, raw.doseSource);
  if (opts.some(o => o.value === raw.age)) return raw;
  const def = opts.find(o => o.value === 'adult')?.value ?? (opts[0]?.value ?? '');
  return { ...raw, age: def };
}

export function autoFill(raw, choices) {
  const cat = categoryOf(raw.product);
  const code = limitGroupFor(cat, raw.productState);
  const next = { ...raw };
  if (code && foodGroupOptions(choices).some(o => o.value === code)) {
    next.foodGroup = code;
  }
  const dm = dryMatterFor(choices.dryMatter || [], raw.product);
  if (!raw.dmUser) next.dryMatter = dm ? String(dm.value) : '';
  const df = dryingFactorFor(choices.limitsRu || [], cat);
  if (!raw.dfUser) next.dryingFactor = df ? String(df.value) : '';
  return next;
}

export function initialRaw(choices) {
  const doseSource = doseSourceOptions(choices)[0]?.value ?? '';
  const nuc = choices.nuclides.includes('Cs-137') ? 'Cs-137' : (choices.nuclides[0] ?? '');
  const base = { age: '', doseSource, riskCoeff: '0.055', portionG: '100', timesPerDay: '1', daysPerWeek: '1', weeksPerMonth: '4', monthsPerYear: '3', years: '1', eatDate: '', dryMatter: '', dryingFactor: '', procMode: 'none', procFr: '1', procRecs: [], procVar: 'best', foodGroup: '', product: '', productState: 'fresh', prepMode: 'as_is', concK: '1', rawMass: '', probeMass: '', sampleMass: '', dmUser: false, dfUser: false, nuclides: [newNuclide(nuc)] };
  return autoFill(fixAge(base, choices), choices);
}

export function setField(raw, choices, name, value) {
  const next = { ...raw, [name]: value };
  if (name === 'doseSource') return fixAge(next, choices);
  if (name === 'product' || name === 'productState') return autoFill(next, choices);
  if (name === 'dryMatter') {
    next.dmUser = value !== '';
    return value === '' ? autoFill(next, choices) : next;
  }
  if (name === 'dryingFactor') {
    next.dfUser = value !== '';
    return value === '' ? autoFill(next, choices) : next;
  }
  return next;
}

export function setNuclideField(raw, index, name, value) {
  const nucs = [...raw.nuclides];
  const n = { ...nucs[index], [name]: value };
  if (name === 'transfer') n.transferPicked = true;
  nucs[index] = n;
  return { ...raw, nuclides: nucs };
}

export function addNuclide(raw, choices) {
  const nuc = choices.nuclides.includes('Cs-137') ? 'Cs-137' : choices.nuclides[0];
  return { ...raw, nuclides: [...raw.nuclides, newNuclide(nuc)] };
}

export function removeNuclide(raw, index) {
  if (raw.nuclides.length <= 1) return raw;
  const nucs = [...raw.nuclides];
  nucs.splice(index, 1);
  return { ...raw, nuclides: nucs };
}

export function transferView(raw, choices, index) {
  const n = raw.nuclides[index];
  const query = raw.product || '';
  const o = transferOptions(choices, n.nuclide, query);
  const count = o.groups.reduce((s, g) => s + g.items.length, 0);
  const options = [];
  if (summaryOffered(count, o.fallback, query)) {
    options.push({ value: 'ALL', label: `Сводная оценка: интервал по всем источникам (${count} зап., ${o.groups.length} ист.)` });
  }
  options.push({ value: '', label: '— не оценивать загрязнение —' });
  const groups = o.groups.map(g => ({ label: SOURCE_SHORT[g.source] || g.source, items: g.items.map(i => ({ value: i.id, label: i.label })) }));
  const allValues = [...options.map(x => x.value), ...groups.flatMap(g => g.items.map(i => i.value))];
  const value = (n.transferPicked && allValues.includes(n.transfer)) ? n.transfer : options[0].value;
  const transferIds = groups.flatMap(g => g.items.map(i => i.value));
  let hint;
  if (o.fallback) {
    hint = 'Для этого продукта КП в данных нет — показан весь список.';
  } else if (!query.trim()) {
    hint = 'Введите продукт — сводная оценка строится по записям этого продукта. Показан весь список КП.';
  } else {
    hint = `Записей для продукта: ${o.matched}. ${TUM_HINT}`;
  }
  return { options, groups, value, transferIds, hint };
}

export function procView(raw, choices) {
  const options = raw.nuclides[0] ? processingOptions(choices, raw.nuclides[0].nuclide, categoryOf(raw.product)) : [];
  const checked = (raw.procRecs || []).filter(id => options.some(o => o.value === id));
  return { options, checked };
}

export function effectiveRaw(raw, choices) {
  return { ...raw, procRecs: procView(raw, choices).checked, nuclides: raw.nuclides.map((n, i) => { const t = transferView(raw, choices, i); return { ...n, transfer: t.value, transferIds: t.transferIds }; }) };
}

export function toInput(raw, choices) {
  return buildInput(effectiveRaw(raw, choices));
}

export function hints(raw, choices) {
  const cat = categoryOf(raw.product);
  let auto = '';
  if (cat) {
    const code = limitGroupFor(cat, raw.productState);
    const groupLabel = (code && foodGroupOptions(choices).find(o => o.value === code)?.label) || 'нет группы';
    const dm = dryMatterFor(choices.dryMatter || [], raw.product);
    const df = dryingFactorFor(choices.limitsRu || [], cat);
    let dfTxt = '';
    if (raw.productState === 'dried') {
      dfTxt = df ? `; усушка по нормативу ТР ТС 021/2011: ${fmtNum(df.dried)} / ${fmtNum(df.fresh)} = ${fmtNum(df.value)}` : '; усушку задайте вручную (в нормативе нет пары свежий/сушёный)';
    }
    auto = `Категория: ${cat.ru}; нормы ТР ТС: ${groupLabel}` + (dm ? `; сухое вещество ${dm.item} ${fmtNum(dm.value)} % (${SOURCE_SHORT[dm.source] || dm.source})` : '') + dfTxt;
  }
  const c = kFor(raw);
  const prep = c.note || 'K = масса сырья / масса пробы после подготовки; A продукта = A пробы / K.';
  const pm = perMonth(raw);
  const m = numOrNull(raw.monthsPerYear);
  const g = numOrNull(raw.portionG);
  const y = numOrNull(raw.years);
  let diet = '';
  if (pm !== null && m !== null) {
    diet = `= ${fmtNum(pm)} порц. в месяц, ${fmtNum(pm * m)} в год`;
    if (g !== null) diet += `, ${fmtNum(pm * m * g / 1000)} кг в год`;
    if (y) diet += `, ${fmtNum(pm * m * g * y / 1000)} кг за ${fmtNum(y)} г.`;
  }
  return { auto, prep, diet };
}

export function rawFromInput(input, choices) {
  const str = v => (v === null || v === undefined) ? '' : String(v);
  const plain = x => String(Number(Number(x).toPrecision(6)));
  const hasFreq = input.timesPerDay != null;
  const prep = input.nuclides[0]?.samplePrep || { mode: 'as_is', concentrationFactor: 1 };
  const recIds = input.processing.recordIds?.length ? input.processing.recordIds : (input.processing.recordId ? [input.processing.recordId] : []);
  const raw = {
    age: input.age, doseSource: input.doseSource, riskCoeff: str(input.riskCoeffPerSv),
    portionG: input.portionKg == null ? '' : plain(input.portionKg * 1000),
    timesPerDay: hasFreq ? str(input.timesPerDay) : str(input.portionsPerMonth ?? input.portionsPerYear),
    daysPerWeek: hasFreq ? str(input.daysPerWeek) : '1',
    weeksPerMonth: hasFreq ? str(input.weeksPerMonth) : '1',
    monthsPerYear: str(input.monthsPerYear ?? 1), years: str(input.years), eatDate: input.eatDate || '',
    dryMatter: str(input.dryMatterPercent), dryingFactor: str(input.dryingFactor),
    procMode: input.processing.mode, procFr: str(input.processing.fr), procRecs: recIds, procVar: input.processing.variant || 'best',
    foodGroup: input.foodGroupCode || '', product: input.product?.name || '', productState: input.product?.state || 'fresh',
    prepMode: prep.mode || 'as_is', concK: str(prep.concentrationFactor), rawMass: str(prep.rawMassG), probeMass: str(prep.probeMassG), sampleMass: str(prep.sampleMassG),
    dmUser: input.dryMatterPercent != null, dfUser: input.dryingFactor != null,
    nuclides: input.nuclides.map(n => ({ ...newNuclide(n.nuclide), source: n.source,
      measured: str(n.measuredBqPerKg),
      unc: n.measuredBqPerKg ? String(+((n.measuredUncertaintyBqPerKg ?? 0) * (n.samplePrep?.concentrationFactor || 1) / n.measuredBqPerKg * 100).toPrecision(6)) : '0',
      sampleDate: n.sampleDate || '', dep: str(n.depositionKBqPerM2), depDate: n.depositionDate || '',
      transfer: n.transferId || '', transferPicked: !!n.transferId, variant: n.variant || 'central' }))
  };
  return fixAge(raw, choices);
}
