import { fmtNum } from './fmt.js';
import { ciKm2ToKBqM2, kBqM2ToCiKm2 } from '../calc/units.js';
import { transferOptions, concentrationFor, productNames, TUM_HINT } from './product.js';
import { decodeSpe, parseSpeHeader, speToForm, concentrationFromMasses } from './spe.js';
import { categoryOf, limitGroupFor, dryMatterFor, processingMatches, dryingFactorFor } from '../calc/catalog.js';
import FOOD_RU from './food_ru.json' with { type: 'json' };
import SOURCE_SHORT from './source_short.json' with { type: 'json' };
import { attachSuggest, cleanProductNames } from './suggest.js';
import { AGE_BANDS, LIFETIME_END_AGE } from '../calc/lifetime.js';
export const COMMON_PRODUCTS = ['Молоко', 'Молоко сухое', 'Творог', 'Сыр', 'Говядина', 'Свинина', 'Картофель', 'Морковь', 'Капуста', 'Свёкла',
  'Хлеб', 'Мука пшеничная', 'Крупа гречневая', 'Рыба речная', 'Вода питьевая', 'Чай травяной'];
export { SOURCE_SHORT };

// K: по массам сырья и пробы (как в ЛСРМ), если обе заданы; иначе по способу подготовки
// #FR-41: порций в месяц = раз в день × дней в неделю × недель в месяц (любое пустое — null)
export function perMonth(raw) {
  const v = [raw.timesPerDay, raw.daysPerWeek, raw.weeksPerMonth].map(numOrNull);
  return v.some(x => x === null) ? null : v[0] * v[1] * v[2];
}

export function kFor(raw) {
  const km = concentrationFromMasses(numOrNull(raw.rawMass), numOrNull(raw.probeMass));
  if (km !== null) return { k: km, auto: true, note: `K = m сырья / m пробы = ${fmtNum(km)}` };
  return concentrationFor(raw.prepMode || 'as_is', numOrNull(raw.dryMatter), numOrNull(raw.concK));
}

export const AGE_ORDER = ['3m','1y','1-2y','5y','10y','12-17y','15y','adult'];
export const AGE_LABEL = {
  '3m': '3 месяца', '1y': '1 год', '1-2y': '1–2 года', '5y': '5 лет',
  '10y': '10 лет', '12-17y': '12–17 лет', '15y': '15 лет', 'adult': 'Взрослый'
};
export const SOURCE_LABEL = {
  ICRP119_F1: 'ICRP 119 (Publ. 72)', NRB2009_App2: 'НРБ-99/2009, прил. 2'
};

export function doseSourceOptions(choices) {
  return choices.doseSources
    .filter(s => s !== 'NRB2009_App2a')
    .map(v => ({ value: v, label: SOURCE_LABEL[v] || v }));
}

export function agesFor(choices, doseSource) {
  let set = new Set(choices.ages[doseSource] || []);
  if (doseSource === 'NRB2009_App2') {
    (choices.ages['NRB2009_App2a'] || []).forEach(a => set.add(a));
  }
  return AGE_ORDER.filter(a => set.has(a)).map(v => ({ value: v, label: AGE_LABEL[v] || v }));
}

export function elementOf(nuclideLabel) {
  if (!nuclideLabel) return '';
  const m = nuclideLabel.match(/^([A-Za-z]+)/);
  return m ? m[1] : '';
}

export function transferGroups(choices, nuclide) {
  const el = elementOf(nuclide);
  const map = new Map();
  for (const rec of choices.transfer) {
    if (elementOf(rec.nuclide) === el) {
      if (!map.has(rec.source)) map.set(rec.source, []);
      // центр — am, иначе gm (как в model.js), в м²/кг; quantity — строка «Tag»/«KP», не запись
      const c = Number.isFinite(rec.am) ? rec.am : (Number.isFinite(rec.gm) ? rec.gm : null);
      const centralStr = c === null ? 'нет среднего' : `${fmtNum(c * rec.unit_factor)} м²/кг`;
      let basis = 'основа не указана';
      if (rec.mass_basis === 'dry') basis = 'сухая';
      else if (rec.mass_basis === 'fresh') basis = 'сырая';
      
      map.get(rec.source).push({
        id: rec.id,
        label: `${rec.item_ru} — ${rec.quantity} ${centralStr} · ${basis} · ${rec.level}`,
        disabled: false
      });
    }
  }
  const groups = [];
  for (const [source, items] of map.entries()) {
    items.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    groups.push({ source, items });
  }
  return groups.sort((a, b) => a.source.localeCompare(b.source));
}

// category (из каталога по продукту): только обработка этого вида продуктов; нет совпадений — весь список
export function processingOptions(choices, nuclide, category = null) {
  // #FR-54: только записи вида выбранного продукта; продукт не задан или не узнан — пусто (без «всего списка»)
  const list = category ? choices.processing.filter(r => processingMatches(r, category)) : [];
  const el = elementOf(nuclide);
  const opts = [];
  for (const rec of list) {
    const rEl = elementOf(String(rec.nuclide));
    if (rEl === el || !/^[A-Za-z]/.test(String(rec.nuclide)) || String(rec.nuclide).includes('радионуклид')) {
      // fillSelect читает value (было id → option.value = "undefined", справочник не работал); нет рекомендованного — диапазон
      const v = rec.value_best != null ? fmtNum(rec.value_best)
        : (rec.value_min != null && rec.value_max != null ? `${fmtNum(rec.value_min)}–${fmtNum(rec.value_max)}` : fmtNum(rec.value_min ?? rec.value_max));
      // #FR-22: название продукта на экране — по-русски (словарь); в данных и провенансе остаётся оригинал первоисточника
      opts.push({ value: rec.id, id: rec.id, label: `${FOOD_RU[rec.food] ?? rec.food} — ${rec.process_ru}: Fr ${v} [${rec.level}]` });
    }
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function numOrNull(v) {
  if (v === '' || v === undefined || v === null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// #FR-65: питание с начального возраста до 70 лет; возрастная группа в начале — для показателей «за год»
export function lifetimeOf(raw) {
  const start = numOrNull(raw.startAge);
  if (!raw.lifeMode || raw.doseSource !== 'ICRP119_F1' || start === null || start < 0 || start >= LIFETIME_END_AGE) return null;
  const band = AGE_BANDS.find(b => start >= b.from && start < b.to);
  return { fromAge: start, toAge: LIFETIME_END_AGE, startBand: band.age };
}

export function buildInput(raw) {
  const life = lifetimeOf(raw);
  return {
    age: life ? life.startBand : raw.age,
    lifetime: life ? { fromAge: life.fromAge, toAge: life.toAge } : null,
    doseSource: raw.doseSource,
    riskCoeffPerSv: numOrNull(raw.riskCoeff),
    // рацион вводится в граммах и порциях в месяц × месяцев в году (#FR-12, #FR-16); модель получает кг и порций в год
    portionKg: numOrNull(raw.portionG) === null ? null : numOrNull(raw.portionG) / 1000,
    portionsPerYear: perMonth(raw) === null || numOrNull(raw.monthsPerYear) === null ? null : perMonth(raw) * numOrNull(raw.monthsPerYear),
    portionsPerMonth: perMonth(raw), monthsPerYear: numOrNull(raw.monthsPerYear),
    timesPerDay: numOrNull(raw.timesPerDay), daysPerWeek: numOrNull(raw.daysPerWeek), weeksPerMonth: numOrNull(raw.weeksPerMonth),
    years: life ? life.toAge - life.fromAge : (numOrNull(raw.years) ?? 1),
    eatDate: raw.eatDate || null,
    dryMatterPercent: numOrNull(raw.dryMatter),
    // #FR-34: только для сушёного продукта — пересчёт на исходный (свежий) продукт
    dryingFactor: raw.productState === 'dried' ? numOrNull(raw.dryingFactor) : null,
    processing: {
      mode: raw.procMode,
      fr: numOrNull(raw.procFr),
      recordId: raw.procRecs?.[0] ?? raw.procRec ?? null,
      recordIds: raw.procRecs ?? (raw.procRec ? [raw.procRec] : []),
      variant: raw.procVar || 'best'
    },
    foodGroupCode: raw.foodGroup || null,
    product: { name: raw.product || '', state: raw.productState || 'fresh' },
    nuclides: (raw.nuclides || []).map(n => ({
      // подготовка пробы общая для продукта; K считается из режима (высушена — из % сухого вещества)
      samplePrep: { mode: raw.prepMode || 'as_is', concentrationFactor: kFor(raw).k, rawMassG: numOrNull(raw.rawMass), probeMassG: numOrNull(raw.probeMass), sampleMassG: numOrNull(raw.sampleMass) },
      nuclide: n.nuclide,
      source: n.source,
      measuredBqPerKg: numOrNull(n.measured),
      // #FR-27: неопределённость вводится в %; в Бк/кг продукта (A пробы / K), т. к. правило B сравнивает с A продукта
      measuredUncertaintyBqPerKg: (numOrNull(n.measured) ?? 0) / (kFor(raw).k || 1) * (numOrNull(n.unc) ?? 0) / 100,
      sampleDate: n.sampleDate || null,
      depositionKBqPerM2: numOrNull(n.dep),
      depositionDate: n.depDate || null,
      transferId: n.transfer || null,
      transferIds: n.transfer === 'ALL' ? (n.transferIds || []) : [],
      variant: n.variant || 'central'
    }))
  };
}

export function presetRadGear() {
  return {
    age: 'adult', doseSource: 'ICRP119_F1', riskCoeffPerSv: 0.05,
    portionKg: 0.1046, portionsPerYear: 1, years: 1, eatDate: null, dryMatterPercent: null,
    processing: { mode: 'none', fr: 1, recordId: null, variant: 'best' },
    foodGroupCode: 'mushrooms_dried',
    product: { name: 'грибы', state: 'dried' },
    nuclides: [{
      samplePrep: { mode: 'as_is', concentrationFactor: 1 },
      nuclide: 'Cs-137', source: 'measured', measuredBqPerKg: 9800, measuredUncertaintyBqPerKg: 0,
      sampleDate: null, depositionKBqPerM2: null, depositionDate: null, transferId: null, variant: 'central'
    }]
  };
}

// --- DOM Functions ---

// #FR-48: список с галочками (div) — отмеченное сохраняется при перезаполнении
function fillChecklist(box, opts) {
  const keep = new Set(checkedIds(box));
  box.innerHTML = '';
  if (!opts.length) box.innerHTML = '<p class="hint">Введите продукт — здесь появятся способы обработки для него. Для продукта вне справочника задайте свой Fr.</p>';
  for (const o of opts) {
    const lab = document.createElement('label');
    lab.className = 'check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = o.value;
    cb.checked = keep.has(o.value);
    lab.append(cb, document.createTextNode(' ' + o.label));
    box.appendChild(lab);
  }
}
export const checkedIds = (box) => [...box.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);

function fillSelect(sel, opts) {
  if (sel.tagName !== 'SELECT') return fillChecklist(sel, opts);
  sel.innerHTML = '';
  for (const o of opts) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
}

// #FR-47: сводная оценка — только по записям выбранного продукта: нужны и название продукта, и совпавшие записи
export const summaryOffered = (n, fallback, query) => n > 0 && !fallback && String(query ?? '').trim() !== '';

function fillTransferSelect(sel, groups, fallback = false, query = '') {
  const prev = sel.value;
  sel.innerHTML = '';
  // #FR-31: первым — сводная оценка (интервал по всем источникам); только когда записи подобраны по продукту
  const n = groups.reduce((s, g) => s + g.items.length, 0);
  if (summaryOffered(n, fallback, query)) sel.add(new Option(`Сводная оценка: интервал по всем источникам (${n} зап., ${groups.length} ист.)`, 'ALL'));
  sel.add(new Option('— не оценивать загрязнение —', ''));
  for (const g of groups) {
    const og = document.createElement('optgroup');
    og.label = SOURCE_SHORT[g.source] || g.source;
    for (const i of g.items) {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = i.label;
      if (i.disabled) opt.disabled = true;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
  // выбор оператора (в т. ч. «не оценивать») переживает перефильтрацию; без выбора — первый пункт (сводная)
  if (!sel.dataset.bound) { sel.dataset.bound = '1'; sel.addEventListener('change', () => { sel.dataset.picked = '1'; }); }
  if ((prev || sel.dataset.picked) && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

// список КП карточки: по элементу нуклида и по введённому продукту; при отсутствии совпадений — весь список с пометкой
function refreshTransfer(doc, choices, card) {
  const nuc = card.querySelector('.n-nuclide').value;
  const o = transferOptions(choices, nuc, doc.getElementById('product')?.value || '');
  const query = doc.getElementById('product')?.value || '';
  fillTransferSelect(card.querySelector('.n-transfer'), o.groups, o.fallback, query);
  const h = card.querySelector('.n-trHint');
  if (h) h.textContent = o.fallback ? 'Для этого продукта КП в данных нет — показан весь список.' : !query.trim() ? 'Введите продукт — сводная оценка строится по записям этого продукта. Показан весь список КП.' : `Записей для продукта: ${o.matched}. ${TUM_HINT}`;
}

export function initForm(doc, choices) {
  const doseSel = doc.getElementById('doseSource');
  fillSelect(doseSel, doseSourceOptions(choices));
  
  const ageSel = doc.getElementById('age');
  const foodSel = doc.getElementById('foodGroup');
  const procRecSel = doc.getElementById('procRec');
  const form = doc.getElementById('form');
  const addBtn = doc.getElementById('addNuclide');
  const procMode = doc.getElementById('procMode');

  function updateAge() {
    const src = doseSel.value;
    const opts = agesFor(choices, src);
    const prev = ageSel.value; // пусто при первом заполнении
    fillSelect(ageSel, opts);
    const keep = prev && opts.find(o => o.value === prev);
    ageSel.value = keep ? prev : (opts.find(o => o.value === 'adult') ? 'adult' : opts[0].value);
  }

  function refreshProcRec() {
    const raw = readRaw(doc);
    const nuc = raw.nuclides[0];
    if (nuc) {
      fillSelect(procRecSel, processingOptions(choices, nuc.nuclide, categoryOf(doc.getElementById('product')?.value)));
    } else {
      fillSelect(procRecSel, []);
    }
  }

  doseSel.addEventListener('change', updateAge);
  
  procMode.addEventListener('change', () => {
    const m = procMode.value;
    doc.getElementById('procFrWrap').hidden = (m !== 'fr');
    doc.getElementById('procRecWrap').hidden = (m !== 'record');
    doc.getElementById('procVarWrap').hidden = (m !== 'record');
  });

  addBtn.addEventListener('click', () => {
    addNuclideCard(doc, choices);
    refreshProcRec();
  });

  form.addEventListener('submit', e => e.preventDefault());

  // Initial setup
  updateAge();
  
  // Food group
  const foodOpt = document.createElement('option');
  foodOpt.value = '';
  foodOpt.textContent = '— не сравнивать —';
  foodSel.appendChild(foodOpt);
  for (const g of choices.limitGroups) {
    const opt = document.createElement('option');
    opt.value = g.code;
    if (!g.ru || g.ru === '—' || g.code === 'other') continue; // #FR-22: без служебных кодов и пустых групп
    opt.textContent = g.ru; // textContent не интерпретирует HTML — esc здесь дал бы «&amp;»
    foodSel.appendChild(opt);
  }

  // Продукт и проба: подсказки названий из данных; K вычисляется или вводится
  // #FR-36: своя подсказка (datalist в приложении не фильтрует): только то, что каталог узнаёт как продукт, + обычные продукты
  const productInp = doc.getElementById('product');
  if (productInp) attachSuggest(productInp, cleanProductNames(productNames(choices), n => !!categoryOf(n), COMMON_PRODUCTS));
  productInp?.addEventListener('input', () => { doc.querySelectorAll('#nuclides .nuc').forEach(c => refreshTransfer(doc, choices, c)); refreshProcRec(); });
  const syncK = () => {
    const kInp = doc.getElementById('concK');
    const c = kFor(readRaw(doc));
    kInp.readOnly = c.auto;
    if (c.auto) kInp.value = c.k === null ? '' : plain(c.k);
    doc.getElementById('prepHint').textContent = c.note || 'K = масса сырья / масса пробы после подготовки; A продукта = A пробы / K.';
  };
  doc.getElementById('prepMode')?.addEventListener('change', syncK);
  for (const id of ['dryMatter', 'concK', 'rawMass', 'probeMass']) doc.getElementById(id)?.addEventListener('input', syncK);
  syncK();

  // Заголовок .spe ЛСРМ → продукт, массы, дата активности (сама активность не переносится)
  doc.getElementById('speFile')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const f = speToForm(parseSpeHeader(decodeSpe(await file.arrayBuffer())));
    const put = (id, v) => { const el = doc.getElementById(id); if (el && v !== null && v !== undefined) el.value = v; };
    put('product', f.product); put('rawMass', f.rawMassG); put('probeMass', f.probeMassG); put('sampleMass', f.sampleMassG);
    if (f.refDate) doc.querySelectorAll('#nuclides .n-sampleDate').forEach(el => { el.value = f.refDate; });
    const info = doc.getElementById('speInfo');
    info.hidden = false;
    info.textContent = `Из ${file.name}: ${f.product || 'шифр пуст'}; ${f.warnings.join('; ')}.`;
    doc.getElementById('product').dispatchEvent(new Event('input', { bubbles: true }));
    syncK();
    doc.getElementById('form').dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Initial nuclide card
  let initNuc = null;
  if (choices.nuclides.includes('Cs-137')) initNuc = 'Cs-137';
  else if (choices.nuclides.length > 0) initNuc = choices.nuclides[0];
  
  addNuclideCard(doc, choices, { nuclide: initNuc });

  // #FR-15/#FR-17: по продукту и состоянию сами подтягиваются группа норм, % сухого вещества (из данных) и список обработки;
  // ручной ввод % сухого вещества не перезаписывается
  const dmInp = doc.getElementById('dryMatter'), autoHint = doc.getElementById('autoHint');
  // стёр значение — снова подставляется из данных
  dmInp.addEventListener('input', () => { dmInp.dataset.user = dmInp.value ? '1' : ''; if (!dmInp.value) autoFill(); });
  const dfInp = doc.getElementById('dryingFactor'), dfWrap = doc.getElementById('dryingWrap');
  dfInp?.addEventListener('input', () => { dfInp.dataset.user = dfInp.value ? '1' : ''; if (!dfInp.value) autoFill(); });
  const autoFill = () => {
    const name = productInp.value, state = doc.getElementById('productState').value, cat = categoryOf(name);
    const code = limitGroupFor(cat, state);
    if (code && [...foodSel.options].some(o => o.value === code)) foodSel.value = code;
    const dm = dryMatterFor(choices.dryMatter || [], name);
    if (!dmInp.dataset.user) dmInp.value = dm ? dm.value : '';
    // #FR-34: коэффициент усушки — из норматива (сушёный / свежий), ручной ввод не перезаписывается
    const df = dryingFactorFor(choices.limitsRu || [], cat);
    if (dfWrap) dfWrap.hidden = state !== 'dried';
    if (dfInp && !dfInp.dataset.user) dfInp.value = df ? df.value : '';
    const dfTxt = state === 'dried' ? (df ? `; усушка по нормативу ТР ТС 021/2011: ${fmtNum(df.dried)} / ${fmtNum(df.fresh)} = ${fmtNum(df.value)}` : '; усушку задайте вручную (в нормативе нет пары свежий/сушёный)') : '';
    if (autoHint) autoHint.textContent = cat ? `Категория: ${cat.ru}; нормы ТР ТС: ${(code && [...foodSel.options].find(o => o.value === code)?.textContent) || 'нет группы'}` + (dm ? `; сухое вещество ${dm.item} ${fmtNum(dm.value)} % (${SOURCE_SHORT[dm.source] || dm.source})` : '') + dfTxt : '';
    refreshProcRec();
    syncK();
  };
  productInp.addEventListener('input', autoFill);
  // #FR-41: итог частоты под рационом
  const dietIds = ['portionG', 'timesPerDay', 'daysPerWeek', 'weeksPerMonth', 'monthsPerYear', 'years'];
  const dietHint = () => {
    const h = doc.getElementById('dietHint'); if (!h) return;
    const raw = Object.fromEntries(dietIds.map(id => [id, doc.getElementById(id)?.value]));
    const pm = perMonth(raw), m = numOrNull(raw.monthsPerYear), g = numOrNull(raw.portionG), y = numOrNull(raw.years);
    h.textContent = pm === null || m === null ? '' : `= ${fmtNum(pm)} порц. в месяц, ${fmtNum(pm * m)} в год` + (g === null ? '' : `, ${fmtNum(pm * m * g / 1000)} кг в год`) + (y ? `, ${fmtNum(pm * m * g * y / 1000)} кг за ${fmtNum(y)} г.` : '');
  };
  dietIds.forEach(id => doc.getElementById(id)?.addEventListener('input', dietHint));
  dietHint();
  doc.getElementById('productState').addEventListener('change', autoFill);
}

// <label>текст<control></label>: подпись оборачивает поле (вёрстка колонкой и доступное имя поля)
function field(text, control) {
  const l = document.createElement('label');
  l.append(document.createTextNode(text), control);
  return l;
}
// число для <input type="number">: точка, без пробелов и запятой (fmtNum даёт «0,027» — такое поле не примет)
const plain = (x) => String(Number(x.toPrecision(6)));

export function addNuclideCard(doc, choices, initial = {}) {
  const container = doc.getElementById('nuclides');
  const card = document.createElement('div');
  card.className = 'nuc';

  // Row 1: Nuclide, Source, Delete
  const row = document.createElement('div');
  row.className = 'row';
  
  const nucLabel = document.createElement('label');
  nucLabel.textContent = 'Нуклид';
  const nucSel = document.createElement('select');
  nucSel.className = 'n-nuclide';
  fillSelect(nucSel, choices.nuclides.map(n => ({ value: n, label: n })));
  
  const srcLabel = document.createElement('label');
  srcLabel.textContent = 'Откуда активность';
  const srcSel = document.createElement('select');
  srcSel.className = 'n-source';
  const optMeas = new Option('Измерено', 'measured');
  const optDep = new Option('Из плотности загрязнения почвы', 'deposition');
  srcSel.add(optMeas); // #FR-7: активность только измеренная; продукт из плотности загрязнения не считаем (optDep не добавляется)

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'del';
  delBtn.setAttribute('aria-label', 'Убрать нуклид');
  delBtn.textContent = '×';

  const srcField = field(srcLabel.textContent, srcSel);
  srcField.hidden = true;
  row.append(field(nucLabel.textContent, nucSel), srcField, delBtn);
  card.appendChild(row);

  // Measured Fields
  const fMeas = document.createElement('div');
  fMeas.className = 'fields f-measured';
  
  const measInp = document.createElement('input');
  measInp.className = 'n-measured';
  measInp.type = 'number'; measInp.min = '0'; measInp.step = 'any';
  const uncInp = document.createElement('input');
  uncInp.className = 'n-unc';
  uncInp.type = 'number'; uncInp.min = '0'; uncInp.step = 'any'; uncInp.value = '0';
  const sampDate = document.createElement('input');
  sampDate.className = 'n-sampleDate';
  sampDate.type = 'date';

  fMeas.append(
    field('Активность пробы (протокол), Бк/кг', measInp),
    field('± неопределённость, % (P = 0,95)', uncInp),
    field('Дата, на которую дана активность', sampDate)
  );
  card.appendChild(fMeas);

  // Deposition Fields
  const fDep = document.createElement('div');
  fDep.className = 'fields f-deposition';

  const depInp = document.createElement('input');
  depInp.className = 'n-dep';
  depInp.type = 'number'; depInp.min = '0'; depInp.step = 'any';
  
  const depCiInp = document.createElement('input');
  depCiInp.className = 'n-depCi';
  depCiInp.type = 'number'; depCiInp.min = '0'; depCiInp.step = 'any';

  const depDate = document.createElement('input');
  depDate.className = 'n-depDate';
  depDate.type = 'date';

  const transSel = document.createElement('select');
  transSel.className = 'n-transfer';
  
  const varSel = document.createElement('select');
  varSel.className = 'n-variant';
  varSel.add(new Option('Среднее', 'central'));
  varSel.add(new Option('Минимум', 'min'));
  varSel.add(new Option('Максимум', 'max'));

  // #FR-7: плотность загрязнения не вводится, а оценивается по активности продукта через КП почва → продукт
  const trHint = document.createElement('p');
  trHint.className = 'hint n-trHint';
  const trField = field('Оценка загрязнения места сбора: КП почва → продукт', transSel);
  trField.style.gridColumn = '1 / -1';
  trHint.style.gridColumn = '1 / -1';
  fDep.append(trField, trHint);
  card.appendChild(fDep);

  container.appendChild(card);

  // Wires
  srcSel.addEventListener('change', () => {
    fMeas.hidden = (srcSel.value !== 'measured');
  });

  nucSel.addEventListener('change', () => {
    refreshTransfer(doc, choices, card);
    // Refresh procRec if this is the first card
    const cards = container.querySelectorAll('.nuc');
    if (cards[0] === card) {
      const procRecSel = doc.getElementById('procRec');
      fillSelect(procRecSel, processingOptions(choices, nucSel.value, categoryOf(doc.getElementById('product')?.value)));
    }
  });

  delBtn.addEventListener('click', () => {
    if (container.querySelectorAll('.nuc').length > 1) {
      card.remove();
      container.dispatchEvent(new Event('change', { bubbles: true }));
      const procRecSel = doc.getElementById('procRec');
      const raw = readRaw(doc);
      if (raw.nuclides.length > 0) {
        fillSelect(procRecSel, processingOptions(choices, raw.nuclides[0].nuclide, categoryOf(raw.product)));
      } else {
        fillSelect(procRecSel, []);
      }
    }
  });

  // Unit conversion for deposition
  depInp.addEventListener('input', () => {
    const v = numOrNull(depInp.value);
    if (v !== null) {
      depCiInp.value = plain(kBqM2ToCiKm2(v));
    } else {
      depCiInp.value = '';
    }
  });
  depCiInp.addEventListener('input', () => {
    const v = numOrNull(depCiInp.value);
    if (v !== null) {
      depInp.value = plain(ciKm2ToKBqM2(v));
    } else {
      depInp.value = '';
    }
  });

  // Set initial values
  if (initial.nuclide) nucSel.value = initial.nuclide;
  if (initial.source) srcSel.value = initial.source;
  if (initial.measured !== undefined) measInp.value = initial.measured;
  if (initial.unc !== undefined) uncInp.value = initial.unc;
  if (initial.sampleDate) sampDate.value = initial.sampleDate;
  if (initial.dep !== undefined) depInp.value = initial.dep;
  if (initial.depCi !== undefined) depCiInp.value = initial.depCi;
  if (initial.depDate) depDate.value = initial.depDate;
  if (initial.transfer) transSel.value = initial.transfer;
  if (initial.variant) varSel.value = initial.variant;

  // Trigger change to populate transfer groups and toggle visibility
  nucSel.dispatchEvent(new Event('change'));
  srcSel.dispatchEvent(new Event('change'));
  container.dispatchEvent(new Event('change', { bubbles: true })); // добавление карточки → пересчёт (onFormChange слушает форму)
}

export function readRaw(doc) {
  const container = doc.getElementById('nuclides');
  const cards = container.querySelectorAll('.nuc');
  const nuclides = [];
  for (const card of cards) {
    nuclides.push({
      nuclide: card.querySelector('.n-nuclide').value,
      source: card.querySelector('.n-source').value,
      measured: card.querySelector('.n-measured').value,
      unc: card.querySelector('.n-unc').value,
      sampleDate: card.querySelector('.n-sampleDate').value,
      // поля ввода плотности загрязнения из карточки убраны (#FR-7) — читаются, только если есть
      dep: card.querySelector('.n-dep')?.value ?? '',
      depDate: card.querySelector('.n-depDate')?.value ?? '',
      transfer: card.querySelector('.n-transfer').value,
      transferIds: [...card.querySelector('.n-transfer').options].map(o => o.value).filter(v => v && v !== 'ALL'),
      variant: card.querySelector('.n-variant')?.value ?? 'central'
    });
  }
  return {
    age: doc.getElementById('age').value,
    doseSource: doc.getElementById('doseSource').value,
    riskCoeff: doc.getElementById('riskCoeff').value,
    portionG: doc.getElementById('portionG').value,
    timesPerDay: doc.getElementById('timesPerDay').value,
    daysPerWeek: doc.getElementById('daysPerWeek').value,
    weeksPerMonth: doc.getElementById('weeksPerMonth').value,
    monthsPerYear: doc.getElementById('monthsPerYear').value,
    years: doc.getElementById('years').value,
    eatDate: doc.getElementById('eatDate').value,
    dryMatter: doc.getElementById('dryMatter').value,
    dryingFactor: doc.getElementById('dryingFactor')?.value ?? '',
    procMode: doc.getElementById('procMode').value,
    procFr: doc.getElementById('procFr').value,
    procRecs: checkedIds(doc.getElementById('procRec')),
    procVar: doc.getElementById('procVar').value,
    foodGroup: doc.getElementById('foodGroup').value,
    product: doc.getElementById('product')?.value ?? '',
    productState: doc.getElementById('productState')?.value ?? 'fresh',
    prepMode: doc.getElementById('prepMode')?.value ?? 'as_is',
    concK: doc.getElementById('concK')?.value ?? '',
    rawMass: doc.getElementById('rawMass')?.value ?? '',
    probeMass: doc.getElementById('probeMass')?.value ?? '',
    sampleMass: doc.getElementById('sampleMass')?.value ?? '',
    nuclides
  };
}

export function getInput(doc) {
  return buildInput(readRaw(doc));
}

export function setInput(doc, choices, input) {
  // Set simple fields
  doc.getElementById('doseSource').value = input.doseSource;
  doc.getElementById('riskCoeff').value = input.riskCoeffPerSv ?? '';
  doc.getElementById('portionG').value = input.portionKg == null ? '' : plain(input.portionKg * 1000);
  // без разбивки по месяцам (старые сценарии): все порции года — в одном месяце
  // #FR-41: старые сценарии (только порций в месяц) — как «раз в день» при 1 дне в неделю и 1 неделе в месяц
  const hasFreq = input.timesPerDay != null;
  doc.getElementById('timesPerDay').value = hasFreq ? input.timesPerDay : (input.portionsPerMonth ?? input.portionsPerYear ?? '');
  doc.getElementById('daysPerWeek').value = hasFreq ? (input.daysPerWeek ?? '') : 1;
  doc.getElementById('weeksPerMonth').value = hasFreq ? (input.weeksPerMonth ?? '') : 1;
  doc.getElementById('monthsPerYear').value = input.monthsPerYear ?? 1;
  doc.getElementById('years').value = input.years ?? '';
  doc.getElementById('eatDate').value = input.eatDate || '';
  doc.getElementById('dryMatter').value = input.dryMatterPercent ?? '';
  const dfInp = doc.getElementById('dryingFactor');
  if (dfInp && input.dryingFactor != null) { dfInp.value = input.dryingFactor; dfInp.dataset.user = '1'; }
  doc.getElementById('procMode').value = input.processing.mode;
  doc.getElementById('procFr').value = input.processing.fr ?? '';
  const want = new Set(input.processing.recordIds?.length ? input.processing.recordIds : [input.processing.recordId]);
  doc.getElementById('procRec').querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = want.has(cb.value); });
  doc.getElementById('procVar').value = input.processing.variant;
  doc.getElementById('foodGroup').value = input.foodGroupCode || '';
  doc.getElementById('product').value = input.product?.name || '';
  doc.getElementById('productState').value = input.product?.state || 'fresh';
  const prep = input.nuclides[0]?.samplePrep || { mode: 'as_is', concentrationFactor: 1 };
  doc.getElementById('prepMode').value = prep.mode;
  doc.getElementById('concK').value = prep.concentrationFactor ?? '';
  doc.getElementById('rawMass').value = prep.rawMassG ?? '';
  doc.getElementById('probeMass').value = prep.probeMassG ?? '';
  if (prep.rawMassG || prep.probeMassG) doc.getElementById('prepBox')?.setAttribute('open', ''); // есть массы — блок раскрыт
  const sm = doc.getElementById('sampleMass'); if (sm) sm.value = prep.sampleMassG ?? '';
  doc.getElementById('prepMode').dispatchEvent(new Event('change'));

  // Trigger updates for dependent fields
  doc.getElementById('doseSource').dispatchEvent(new Event('change'));
  doc.getElementById('procMode').dispatchEvent(new Event('change'));
  
  doc.getElementById('age').value = input.age;

  // Rebuild nuclide cards
  const container = doc.getElementById('nuclides');
  container.innerHTML = '';
  for (const n of input.nuclides) {
    addNuclideCard(doc, choices, {
      nuclide: n.nuclide,
      source: n.source,
      measured: n.measuredBqPerKg ?? '',
      // обратно к % (#FR-27): da задана в Бк/кг продукта, A пробы / K
      unc: n.measuredBqPerKg ? +((n.measuredUncertaintyBqPerKg ?? 0) * (n.samplePrep?.concentrationFactor || 1) / n.measuredBqPerKg * 100).toPrecision(6) : 0,
      sampleDate: n.sampleDate || '',
      dep: n.depositionKBqPerM2 ?? '',
      depDate: n.depositionDate || '',
      transfer: n.transferId || '',
      variant: n.variant
    });
  }
}

export function onFormChange(doc, callback) {
  const form = doc.getElementById('form');
  form.addEventListener('input', callback);
  form.addEventListener('change', callback);
}
