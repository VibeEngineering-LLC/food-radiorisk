import { buildInput, lifetimeOf, doseSourceOptions, agesFor, processingOptions, kFor, perMonth, numOrNull, SOURCE_SHORT } from '../ui/form.js';
import { transferOptions } from '../ui/product.js';
import { summaryOffered } from '../ui/form.js';
import { normCodeFor, dryMatterFor, dryingFactorFor } from '../calc/catalog.js';
import { matchProduct, productEntry, normIdFor } from '../calc/products.js';
import { transferHint } from '../ui/form.js';
import { fmtNum } from '../ui/fmt.js';
import { variantOffers } from '../calc/processing.js';
import { T, fill } from '../ui/texts_v.js';
import { dietPickFor } from '../ui/diet_view.js';
export { dietView } from '../ui/diet_view.js';

// #FR-81 V11: для подбора группы норм «готовое блюдо» и пустое поле считаются свежим продуктом
const normState = (s) => s === 'dried' ? 'dried' : 'fresh';

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
  const entry = productEntry(choices.products, raw.product, raw.productConfirm || null); // #FR-85: запись словаря продуктов; v11 — частично распознанное только после подтверждения
  const code = normCodeFor(choices.limitsRu || [], entry, normState(raw.measuredForm));
  const next = { ...raw };
  // группа выбрана вручную — не трогаем; иначе по названию продукта, а если название не узнано — сбрасываем прежнюю автоподстановку
  if (!raw.groupUser) next.foodGroup = code && foodGroupOptions(choices).some(o => o.value === code) ? code : '';
  const dm = dryMatterFor(choices.dryMatter || [], entry);
  if (!raw.dmUser) next.dryMatter = dm ? String(dm.value) : '';
  const df = dryingFactorFor(choices.limitsRu || [], entry);
  if (!raw.dfUser) next.dryingFactor = df ? String(df.value) : '';
  return next;
}

// #FR-81 D18: дата начала питания по умолчанию — сегодня (локальная дата)
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function initialRaw(choices, today = todayISO()) {
  const doseSource = doseSourceOptions(choices)[0]?.value ?? '';
  const nuc = choices.nuclides.includes('Cs-137') ? 'Cs-137' : (choices.nuclides[0] ?? '');
  const base = { age: '', doseSource, dietMode: 'default', portionG: '', timesPerDay: '', daysPerWeek: '', weeksPerMonth: '', monthsPerYear: '', years: '1', eatDate: today, lifeMode: false, startAge: '0', endAge: '70', constAct: false, includeY90: false, dryMatter: '', dryingFactor: '', procMode: 'none', procFr: '1', procRecs: [], procVar: 'best', foodGroup: '', product: '', measuredForm: '', prepMode: 'as_is', concK: '1', rawMass: '', probeMass: '', sampleMass: '', dmUser: false, dfUser: false, groupUser: false, dietGroup: '', productConfirm: '', nuclides: [newNuclide(nuc)] };
  return autoFill(fixAge(base, choices), choices);
}

export function setField(raw, choices, name, value) {
  const next = { ...raw, [name]: value };
  if (name === 'doseSource') return fixAge(next, choices);
  if (name === 'product') { next.dietGroup = ''; next.productConfirm = ''; } // #FR-85: ручной выбор группы и подтверждение (v11) относятся к прежнему названию
  if (name === 'product' || name === 'measuredForm' || name === 'productConfirm') return autoFill(next, choices);
  if (name === 'foodGroup') {
    next.groupUser = value !== '';
    return value === '' ? autoFill(next, choices) : next;
  }
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
  const o = transferOptions(choices, n.nuclide, query, raw.productConfirm || null);
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
  const hint = transferHint(o, query); // #FR-86: без ключей — весь список с пометкой
  return { options, groups, value, transferIds, hint };
}

/** #FR-85 (спека §3): продукт не распознан — выбор группы рациона вручную; неоднозначно — выбор из записей-кандидатов */
export function productView(raw, choices) {
  const m = matchProduct(choices.products, raw.product, raw.productConfirm || null);
  const groups = (choices.diet || []).filter(g => g.kind === 'group' && g.code !== 'other').map(g => ({ value: g.code, label: g.label_ru }));
  const candidates = m.candidates.map(e => e.name_ru);
  // #FR-85 v11: «частично» — распознано по части слов; принять запись — только подтверждением (как ручной выбор), иначе группа вручную
  const status = m.confirmed ? 'confirmed' : m.status, words = { entry: m.entry?.name_ru ?? '', matched: m.matchedWords.join(' '), rest: m.uncovered.join(' ') };
  const text = status === 'unknown' && m.composite ? fill(m.composite.kind === 'dish' ? T.PRODUCT_COMPOSITE_DISH : T.PRODUCT_COMPOSITE_CHANGES, { words: m.composite.words.join('», «'), guess: m.composite.guess }) : status === 'unknown' ? T.PRODUCT_UNKNOWN : status === 'ambiguous' ? T.PRODUCT_AMBIGUOUS : status === 'partial' ? fill(T.PRODUCT_PARTIAL, words) : status === 'confirmed' ? fill(T.PRODUCT_CONFIRMED, words) : '';
  const confirm = status === 'partial' || status === 'confirmed' ? { id: m.entry.id, label: fill(T.PRODUCT_CONFIRM_BTN, words) } : null;
  return { status, text, confirm, candidates: status === 'ambiguous' ? candidates : [], groups: status === 'unknown' || status === 'partial' ? groups : [], value: raw.dietGroup || '' };
}

export function procView(raw, choices) {
  const options = raw.nuclides[0] ? processingOptions(choices, raw.nuclides[0].nuclide, productEntry(choices.products, raw.product, raw.productConfirm || null)) : [];
  const checked = (raw.procRecs || []).filter(id => options.some(o => o.value === id));
  const sel = (choices.processing || []).filter(r => checked.includes(r.id));
  return { options, checked, variants: variantOffers(sel) }; // #FR-81 D06c
}

export function effectiveRaw(raw, choices) {
  const pv = procView(raw, choices);
  const procVar = raw.procVar === 'min' && !pv.variants.min || raw.procVar === 'max' && !pv.variants.max ? 'best' : raw.procVar; // вариант, которого нет у выбранных записей, не действует
  return { ...raw, dietPick: dietPickFor(raw, choices), procVar, procVarAsked: raw.procVar, procRecs: pv.checked, nuclides: raw.nuclides.map((n, i) => { const t = transferView(raw, choices, i); return { ...n, transfer: t.value, transferIds: t.transferIds }; }) };
}

export function toInput(raw, choices) {
  return buildInput(effectiveRaw(raw, choices));
}

export function hints(raw, choices) {
  const entry = productEntry(choices.products, raw.product, raw.productConfirm || null);
  let auto = '';
  if (entry) {
    const code = normCodeFor(choices.limitsRu || [], entry, normState(raw.measuredForm));
    const nid = normIdFor(entry, normState(raw.measuredForm)), rec015 = /^t015_/.test(nid || '') ? (choices.limitsRu || []).find(r => r.id === nid) : null; // #FR-85 v11: строка ТР ТС 015 — своё название группы
    const groupLabel = (rec015?.food_group_ru || code && foodGroupOptions(choices).find(o => o.value === code)?.label || (code ? 'нет группы' : 'норматив РФ не установлен')) + (/^t015_/.test(normIdFor(entry, normState(raw.measuredForm)) || '') ? ' (ТР ТС 015 — документ на зерно, не на пищевой продукт; в B не входит)' : ''); // #FR-85 v11: зернобобовые, злаковые (кукуруза), масличные
    const dm = dryMatterFor(choices.dryMatter || [], entry);
    const df = dryingFactorFor(choices.limitsRu || [], entry);
    let dfTxt = '';
    if (raw.measuredForm === 'dried') {
      dfTxt = df ? `; коэффициент концентрирования при сушке по нормативу ТР ТС 021/2011: ${fmtNum(df.dried)} / ${fmtNum(df.fresh)} = ${fmtNum(df.value)}` : '; коэффициент концентрирования при сушке задайте вручную (в нормативе нет пары свежий/сушёный)';
    }
    auto = `Продукт: ${entry.name_ru}${entry.caption ? ` (${entry.caption})` : ''}; нормы ТР ТС: ${groupLabel}` + (dm ? `; сухое вещество ${dm.item} ${fmtNum(dm.value)} % (${SOURCE_SHORT[dm.source] || dm.source})` : '') + dfTxt;
  }
  const c = kFor(raw);
  const prep = c.note || 'K = масса сырья / масса пробы после подготовки; A продукта = A пробы / K.';
  const pm = perMonth(raw);
  const m = numOrNull(raw.monthsPerYear);
  const g = numOrNull(raw.portionG);
  const life = lifetimeOf(raw), y = life ? life.toAge - life.fromAge : numOrNull(raw.years); // #FR-81 D17: тот же срок, что считается
  let diet = '';
  const dp = dietPickFor(raw, choices); // #FR-83 W05: при умолчании — масса из данных, тот же срок, что считается
  if (dp) {
    if (dp.status === 'default' && y) diet = fill(T.DIET_HINT, { value: fmtNum(dp.rec.value), total: fmtNum(dp.rec.value * y), years: fmtNum(y) });
  } else if (pm !== null && m !== null) {
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
  const dietOn = input.diet?.mode === 'default' || input.diet?.mode === 'high'; // #FR-83 W05: поля «знаю» при умолчании пусты
  const prep = input.nuclides[0]?.samplePrep || { mode: 'as_is', concentrationFactor: 1 };
  const recIds = input.processing.recordIds?.length ? input.processing.recordIds : (input.processing.recordId ? [input.processing.recordId] : []);
  const raw = {
    age: input.age, doseSource: input.doseSource,
    dietMode: dietOn ? input.diet.mode : 'own',
    portionG: input.portionKg == null || dietOn ? '' : plain(input.portionKg * 1000),
    timesPerDay: dietOn ? '' : hasFreq ? str(input.timesPerDay) : str(input.portionsPerMonth ?? input.portionsPerYear),
    daysPerWeek: dietOn ? '' : hasFreq ? str(input.daysPerWeek) : '1',
    weeksPerMonth: dietOn ? '' : hasFreq ? str(input.weeksPerMonth) : '1',
    monthsPerYear: dietOn ? '' : str(input.monthsPerYear ?? 1), years: str(input.years), lifeMode: !!input.lifetime, startAge: input.lifetime ? str(input.lifetime.fromAge) : '0', endAge: input.lifetime ? str(input.lifetime.toAge) : '70', eatDate: input.eatDate || '', constAct: !!input.constantActivity, includeY90: !!input.includeY90,
    dryMatter: str(input.dryMatterPercent), dryingFactor: str(input.dryingFactor),
    procMode: input.processing.mode, procFr: str(input.processing.fr), procRecs: recIds, procVar: input.processing.variant || 'best',
    foodGroup: input.foodGroupCode || '', product: input.product?.name || '', dietGroup: input.product?.dietGroup || '', productConfirm: input.product?.confirmId || '', measuredForm: input.product?.state || 'fresh',
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
