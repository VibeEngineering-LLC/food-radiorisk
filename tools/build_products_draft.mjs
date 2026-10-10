import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--root') args.root = argv[++i];
  else if (a === '--extra') args.extra = argv[++i];
  else if (a === '--out') args.out = argv[++i];
  else if (a === '--report') args.report = argv[++i];
  else if (a === '--validate') args.validate = argv[++i];
}
// #FR-85 этап 3: механизмы основ (categoryOf, stemOf, limitGroupFor …), которые читает этот сборщик этапа 1, удалены — он работает только на коммите 0387b32
if (typeof (await import(pathToFileURL(join(resolve(args.root || process.cwd()), 'src/calc/catalog.js')).href)).categoryOf !== 'function') {
  console.error('build_products_draft: этап 1 #FR-85; механизмы основ удалены — запуск только на коммите 0387b32 (git worktree). Словарь — data-src/products.yaml, сборка — tools/fr85_make_products.py');
  process.exit(1);
}
const root = resolve(args.root || process.cwd());
const rel = (p) => resolve(root, p);

const load = (relPath) => JSON.parse(readFileSync(rel(relPath), 'utf8'));

const catalog = await import(pathToFileURL(join(root, 'src/calc/catalog.js')).href);
const norms = await import(pathToFileURL(join(root, 'src/calc/norms.js')).href);
const foodclass = await import(pathToFileURL(join(root, 'src/calc/foodclass.js')).href);
const diet = await import(pathToFileURL(join(root, 'src/calc/diet.js')).href);
const product = await import(pathToFileURL(join(root, 'src/ui/product.js')).href);
const suggest = await import(pathToFileURL(join(root, 'src/ui/suggest.js')).href);
const form = await import(pathToFileURL(join(root, 'src/ui/form.js')).href);

const { categoryOf, limitGroupFor, normRu, CATEGORIES, processingMatches, dryMatterFor } = catalog;
const { pickNormRecord } = norms;
const { productClasses, FOOD_CLASS_RU } = foodclass;
const { dietGroupFor, isBaseProduct } = diet;
const { productNames, matchesProduct, stemOf } = product;
const { cleanProductNames } = suggest;
const { COMMON_PRODUCTS } = form;

const dietData = load('public/data/diet.json');
const transferData = load('public/data/transfer.json');
const processingData = load('public/data/processing.json');
const limitsData = load('public/data/limits_ru.json');

const dietRecs = dietData.records;
const dietCodes = new Set(dietRecs.filter((r) => r.kind === 'group').map((r) => r.code));
const trApp = transferData.records.filter((r) => (r.quantity === 'Tag' || r.quantity === 'KP') && r.unit_norm === 'm2/kg');
const trDry = transferData.records;
const itemRuSet = new Set(transferData.records.map((r) => r.item_ru));
const trGroupOf = new Map();
for (const r of transferData.records) if (!trGroupOf.has(r.item_ru)) trGroupOf.set(r.item_ru, r.food_group);
const limitCodes = new Set(limitsData.records.map((r) => r.food_group_code));
const limitIds = new Set(limitsData.records.map((r) => r.id));
const catKeys = new Set(CATEGORIES.map((c) => c.key));

const names = new Map();
const add = (name, src) => {
  if (name == null) return;
  const disp = String(name).trim();
  if (!disp) return;
  const key = normRu(disp);
  if (!key) return;
  if (!/[а-яё]/i.test(disp)) return;
  if (!names.has(key)) names.set(key, { display: disp, sources: new Set() });
  names.get(key).sources.add(src);
};

for (const n of COMMON_PRODUCTS) add(n, 'common');
addMany('app', cleanProductNames(productNames({ transfer: trApp }), (n) => !!categoryOf(n), COMMON_PRODUCTS));
addMany('unfiltered', cleanProductNames(productNames({ transfer: trApp }), () => true, []));
// записи переходов о продуктах; плотность/глубина почвы, мощность дозы и т. п. — не названия продуктов
const FOOD_QTY = new Set(['Tag', 'KP', 'Fv', 'Fm', 'Ff', 'CR', 'dry_matter', 'meat_fraction', 'feed_intake']);
addMany('data', cleanProductNames(productNames({ transfer: transferData.records.filter((r) => FOOD_QTY.has(r.quantity)) }).concat(processingData.records.map((r) => String(r.food || '').split(',')[0].trim())), () => true, []));
function addMany(src, arr) { for (const n of arr) add(n, src); }
const extraFiles = (args.extra || 'tests/fixtures/fr84_matrix_extra.json,tests/fixtures/fr83_matrix_extra.json').split(',').map((s) => s.trim()).filter(Boolean);
for (const f of extraFiles) {
  const data = JSON.parse(readFileSync(rel(f), 'utf8'));
  for (const pair of data.names || []) add(pair[0], 'extra');
}

const nameList = [...names.values()].sort((a, b) => a.display.localeCompare(b.display, 'ru'));

const STATE_WORDS = /^(суш|сух|вял|сублим)/;
function analyze(name) {
  const words = normRu(name).split(/[\s,.;:()_-]+/).filter(Boolean);
  const state = words.some((w) => STATE_WORDS.test(w)) ? 'dried' : 'fresh';
  const cat = categoryOf(name);
  const category = cat ? cat.key : null;
  // норматив и класс Codex — для обоих состояний: модификатор состояния сам по себе продукт не меняет (сушёные грибы — те же грибы)
  const lim = (st) => (cat ? limitGroupFor(cat, st, name) : null);
  const nrm = (l, st) => (l ? (pickNormRecord(limitsData.records, l, 'Cs-137', name, st).rec?.id ?? null) : null);
  const limit = lim(state), limit_fresh = lim('fresh'), limit_dried = lim('dried');
  const norm = nrm(limit, state), norm_fresh = nrm(limit_fresh, 'fresh'), norm_dried = nrm(limit_dried, 'dried');
  const codex = limit ? productClasses(limit, name, state) : null;
  const codex_fresh = limit_fresh ? productClasses(limit_fresh, name, 'fresh') : null;
  const g = dietGroupFor(dietRecs, name);
  const dietCode = g ? g.code : null;
  const diet_base = g ? isBaseProduct(g, name) : null;
  const proc_cat = category;
  const proc_n = cat ? processingData.records.filter((r) => processingMatches(r, cat)).length : 0;
  let sel = trApp.filter((r) => matchesProduct(r.item_ru, name));
  let mode = sel.length ? 'substring' : 'none';
  if (!sel.length) {
    const st = stemOf(name);
    if (st) {
      sel = trApp.filter((r) => normRu(r.item_ru).includes(st));
      if (sel.length) mode = 'stem';
    }
  }
  const transfer = [...new Set(sel.map((r) => r.item_ru))].sort((a, b) => a.localeCompare(b, 'ru'));
  const transfer_groups = [...new Set(transfer.map((it) => trGroupOf.get(it)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const dry = dryMatterFor(trDry, name)?.id ?? null;
  return { state, category, limit, norm, codex, limit_fresh, limit_dried, norm_fresh, norm_dried, codex_fresh, diet: dietCode, diet_base, proc_cat, proc_n, transfer, transfer_mode: mode, transfer_groups, dry };
}
const signature = (cur) => JSON.stringify([cur.category, cur.norm_fresh, cur.norm_dried, cur.codex_fresh, cur.diet]);

const STATE_RE = /^(суш|сух|вял|сублим|свеж|сыр(ой|ая|ое|ые)$)/;
function groupKey(name) {
  const words = normRu(name).split(/[\s,.;:()_-]+/).filter(Boolean).filter((w) => !STATE_RE.test(w)).sort((a, b) => a.localeCompare(b, 'ru'));
  const joined = words.join(' ');
  return joined || normRu(name);
}

const buckets = new Map();
for (const nm of nameList) {
  const key = groupKey(nm.display);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(nm);
}

const TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
function translit(s) {
  let out = '';
  for (const ch of s.toLowerCase()) out += TRANSLIT[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

const SRC_PRIORITY = { common: 0, app: 1, extra: 2, data: 3, unfiltered: 4 };
const entries = [];
const usedIds = new Set();
for (const [key, bucket] of buckets) {
  const parts = new Map();
  for (const nm of bucket) {
    const cur = analyze(nm.display);
    const sig = signature(cur);
    if (!parts.has(sig)) parts.set(sig, { names: [], cur: {} });
    parts.get(sig).names.push({ display: nm.display, sources: nm.sources, cur });
  }
  const partList = [...parts.values()].sort((a, b) => a.names[0].display.localeCompare(b.names[0].display, 'ru'));
  const split = partList.length > 1;
  const base = 'p_' + translit(key);
  partList.forEach((part, idx) => {
    let id = base + (idx === 0 ? '' : '_' + (idx + 1));
    let suffix = 1;
    while (usedIds.has(id)) { suffix++; id = base + (idx === 0 ? '' : '_' + (idx + 1)) + '_' + String.fromCharCode(96 + suffix); }
    usedIds.add(id);
    const canonical = part.names.slice().sort((a, b) => {
      const pa = Math.min(...[...a.sources].map((s) => SRC_PRIORITY[s] ?? 99));
      const pb = Math.min(...[...b.sources].map((s) => SRC_PRIORITY[s] ?? 99));
      if (pa !== pb) return pa - pb;
      if (a.display.length !== b.display.length) return a.display.length - b.display.length;
      return a.display.localeCompare(b.display, 'ru');
    })[0];
    const cur = canonical.cur;
    const synonyms = [...new Set(part.names.map((n) => normRu(n.display)))].sort((a, b) => a.localeCompare(b, 'ru'));
    const states = [...new Set(part.names.map((n) => n.cur.state))].sort();
    const sources = [...new Set(part.names.flatMap((n) => [...n.sources]))].sort();
    const transfer = [...new Set(part.names.flatMap((n) => n.cur.transfer))].sort((a, b) => a.localeCompare(b, 'ru'));
    const transfer_groups = [...new Set(part.names.flatMap((n) => n.cur.transfer_groups))].sort((a, b) => a.localeCompare(b, 'ru'));
    const name_ru = canonical.display.charAt(0).toUpperCase() + canonical.display.slice(1);
    entries.push({ id, name_ru, synonyms, states, sources, split, category: cur.category, limit: cur.limit_fresh, norm_fresh: cur.norm_fresh, norm_dried: cur.norm_dried, codex: cur.codex_fresh, diet: cur.diet, diet_base: cur.diet_base, proc_cat: cur.proc_cat, proc_n: cur.proc_n, dry: cur.dry, transfer, transfer_groups, transfer_mode: cur.transfer_mode });
  });
}
entries.sort((a, b) => a.id.localeCompare(b.id, 'ru'));

const CAT_DIET_OK = { berries:['berries_wild'], mushrooms:['mushrooms'], game:['game'], meat:['meat','meat_products','lard'], fish:['fish','fish_river'], baby:['baby'], milk:['milk','milk_concentrates'], fats:['oil','mayonnaise','milk_concentrates','lard'], vegetables:['vegetables','potato','legumes'], bread:['bread'], cereals:['cereals','legumes'], water:['water'], herbal:['herbal'] };
const DIET_TR_OK = { berries_wild:['berries_wild','berries','fruit'], mushrooms:['mushrooms'], game:['game','meat'], meat:['meat','game'], meat_products:['meat'], lard:['meat'], fish:[], fish_river:[], milk:['milk'], milk_concentrates:['milk'], potato:['potato','root_crops'], vegetables:['vegetables_leafy','root_crops','potato'], legumes:['legumes'], bread:['cereals'], cereals:['cereals'], fruit:['fruit','berries_wild','berries'], oil:[], herbal:[], water:[], eggs:[], baby:[], mayonnaise:[], other:[] };
const CODEX_BY_DIET = { milk:'milk', baby:'infant', water:'water' };

const discrepancies = [];
const curByName = new Map();
for (const nm of nameList) curByName.set(nm.display, analyze(nm.display));
for (const nm of nameList) {
  const cur = curByName.get(nm.display);
  const srcs = nm.sources;
  if (cur.category !== null && !(CAT_DIET_OK[cur.category] || []).includes(cur.diet)) {
    discrepancies.push({ type:'CAT_DIET', name:nm.display, detail:`категория ${cur.category} → рацион ${cur.diet}`, proposal:`выбрать одно: группа рациона из [${CAT_DIET_OK[cur.category].join(', ')}] или другая категория норматива`, operator:true });
  }
  const first = cur.codex_fresh ? cur.codex_fresh[0] : null;
  const codexFlag = (CODEX_BY_DIET[cur.diet] !== undefined && first !== CODEX_BY_DIET[cur.diet]) || (first && ['milk','infant','water'].includes(first) && CODEX_BY_DIET[cur.diet] !== first && !(first === 'milk' && cur.diet === 'milk_concentrates'));
  if (codexFlag) {
    discrepancies.push({ type:'CODEX', name:nm.display, detail:`Codex ${cur.codex_fresh ? cur.codex_fresh.join('/') : '—'} ↔ рацион ${cur.diet}`, proposal:'задать класс Codex/EU в записи словаря явно', operator:true });
  }
  // группа рациона other — продукт не распознан, это уже NO_CAT; сверять КП не с чем
  const bad = cur.diet === 'other' ? [] : cur.transfer_groups.filter((g) => g !== 'other' && !(DIET_TR_OK[cur.diet] || []).includes(g));
  if (bad.length > 0) {
    discrepancies.push({ type:'TRANSFER_GROUP', name:nm.display, detail:`рацион ${cur.diet}; КП из групп ${bad.join(', ')} (${cur.transfer_mode}, записей ${cur.transfer.length})`, proposal:'перечислить ключи item_ru в записи явно вместо поиска по подстроке/основе', operator:false });
  }
  if (cur.category === null && (cur.diet !== 'other' || cur.transfer.length > 0 || cur.dry !== null)) {
    discrepancies.push({ type:'NO_CAT', name:nm.display, detail:`рацион ${cur.diet}; КП ${cur.transfer.length}; сухое вещество ${cur.dry ?? '—'}`, proposal:'указать строку ТР ТС либо явное «норматива нет»', operator:true });
  }
  if (srcs.has('unfiltered') && !srcs.has('app')) {
    discrepancies.push({ type:'DROPPED', name:nm.display, detail:`КП ${cur.transfer.length}, рацион ${cur.diet}`, proposal:'показывать в подсказках по словарю, а не по наличию категории', operator:false });
  }
}
for (const [key, bucket] of buckets) {
  const parts = new Map();
  for (const nm of bucket) {
    const cur = analyze(nm.display);
    const sig = signature(cur);
    if (!parts.has(sig)) parts.set(sig, []);
    parts.get(sig).push(nm.display);
  }
  if (parts.size > 1) {
    const detail = [...parts.values()].map((ns) => `«${ns[0]}»: ${signature(analyze(ns[0]))}`).join('; ');
    discrepancies.push({ type:'SPLIT', name:key, detail, proposal:'модификатор меняет продукт — оставить отдельные записи', operator:false });
  }
}

function summary() {
  const byType = {};
  for (const t of ['CAT_DIET','CODEX','TRANSFER_GROUP','NO_CAT','DROPPED','SPLIT']) byType[t] = discrepancies.filter((d) => d.type === t).length;
  const a = new Set(discrepancies.filter((d) => ['CAT_DIET','CODEX','TRANSFER_GROUP'].includes(d.type)).map((d) => d.name));
  for (const [, bucket] of buckets) if (new Set(bucket.map((nm) => signature(curByName.get(nm.display)))).size > 1) for (const nm of bucket) a.add(nm.display);
  const b = new Set(discrepancies.filter((d) => d.type === 'NO_CAT').map((d) => d.name));
  const c = new Set(discrepancies.filter((d) => d.operator).map((d) => d.name));
  return { byType, a, b, c };
}

function validate(list) {
  const errors = [];
  const seen = new Map();
  for (const e of list) {
    if (seen.has(e.id)) errors.push(`DUP_ID|${e.id}`);
    seen.set(e.id, e);
  }
  const synMap = new Map();
  for (const e of list) for (const s of e.synonyms || []) {
    if (!synMap.has(s)) synMap.set(s, []);
    synMap.get(s).push(e.id);
  }
  for (const [s, ids] of synMap) if (ids.length > 1) errors.push(`DUP_SYNONYM|${s}|${ids.join(',')}`);
  const codexKeys = new Set(Object.keys(FOOD_CLASS_RU));
  const transferIds = new Set(transferData.records.map((r) => r.id));
  for (const e of list) {
    if (e.category !== null && !catKeys.has(e.category)) errors.push(`BAD_REF|${e.id}|category|${e.category}`);
    if (e.proc_cat !== null && !catKeys.has(e.proc_cat)) errors.push(`BAD_REF|${e.id}|proc_cat|${e.proc_cat}`);
    if (e.diet !== null && !dietCodes.has(e.diet)) errors.push(`BAD_REF|${e.id}|diet|${e.diet}`);
    if (e.limit !== null && !limitCodes.has(e.limit)) errors.push(`BAD_REF|${e.id}|limit|${e.limit}`);
    for (const f of ['norm_fresh', 'norm_dried']) if (e[f] !== null && !limitIds.has(e[f])) errors.push(`BAD_REF|${e.id}|${f}|${e[f]}`);
    for (const c of e.codex || []) if (!codexKeys.has(c)) errors.push(`BAD_REF|${e.id}|codex|${c}`);
    for (const t of e.transfer || []) if (!itemRuSet.has(t)) errors.push(`BAD_REF|${e.id}|transfer|${t}`);
    if (e.dry !== null && !transferIds.has(e.dry)) errors.push(`BAD_REF|${e.id}|dry|${e.dry}`);
  }
  return errors;
}

function readDraft(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('- ')) {
      cur = {};
      out.push(cur);
      const rest = line.slice(2);
      const idx = rest.indexOf(': ');
      if (idx >= 0) {
        const k = rest.slice(0, idx).replace(/^cur_/, '');
        cur[k] = JSON.parse(rest.slice(idx + 2));
      }
    } else if (line.startsWith('  ') && cur) {
      const rest = line.slice(2);
      const idx = rest.indexOf(': ');
      if (idx >= 0) {
        const k = rest.slice(0, idx).replace(/^cur_/, '');
        cur[k] = JSON.parse(rest.slice(idx + 2));
      }
    }
  }
  return out;
}

function writeDraft(file, list, N) {
  const L = [];
  L.push('# products.draft.yaml — ЧЕРНОВИК единого словаря продуктов (#FR-85, этап 1). В сборку не подключён.');
  L.push('# Собран tools/build_products_draft.mjs из текущих механизмов: catalog.js, diet.yaml, foodclass.js, norms.js; transfer — отбор КП приложения.');
  L.push('# Поля после «cur_» — что говорят ТЕКУЩИЕ механизмы, а не принятое решение.');
  L.push(`# записей: ${list.length}, названий: ${N}`);
  L.push('');
  for (const e of list) {
    L.push(`- id: ${JSON.stringify(e.id)}`);
    L.push(`  name_ru: ${JSON.stringify(e.name_ru)}`);
    L.push(`  synonyms: ${JSON.stringify(e.synonyms)}`);
    L.push(`  states: ${JSON.stringify(e.states)}`);
    L.push(`  sources: ${JSON.stringify(e.sources)}`);
    L.push(`  split: ${JSON.stringify(e.split)}`);
    L.push(`  cur_category: ${JSON.stringify(e.category)}`);
    L.push(`  cur_limit: ${JSON.stringify(e.limit)}`);
    L.push(`  cur_norm_fresh: ${JSON.stringify(e.norm_fresh)}`);
    L.push(`  cur_norm_dried: ${JSON.stringify(e.norm_dried)}`);
    L.push(`  cur_codex: ${JSON.stringify(e.codex)}`);
    L.push(`  cur_diet: ${JSON.stringify(e.diet)}`);
    L.push(`  cur_diet_base: ${JSON.stringify(e.diet_base)}`);
    L.push(`  cur_proc_cat: ${JSON.stringify(e.proc_cat)}`);
    L.push(`  cur_proc_n: ${JSON.stringify(e.proc_n)}`);
    L.push(`  cur_dry: ${JSON.stringify(e.dry)}`);
    L.push(`  cur_transfer_mode: ${JSON.stringify(e.transfer_mode)}`);
    L.push(`  cur_transfer: ${JSON.stringify(e.transfer)}`);
  }
  writeFileSync(file, L.join('\n') + '\n', 'utf8');
}

function writeReport(file, list, N) {
  const L = [];
  L.push('# Расхождения механизмов разбора названий продуктов (#FR-85, этап 1)');
  L.push('');
  L.push('Сгенерировано `tools/build_products_draft.mjs`, черновик `data-src/products.draft.yaml`.');
  L.push('');
  const srcCount = {};
  for (const nm of nameList) for (const s of nm.sources) srcCount[s] = (srcCount[s] || 0) + 1;
  for (const s of Object.keys(srcCount).sort()) L.push(`- ${s}: ${srcCount[s]}`);
  L.push('');
  L.push('## Правила сверки');
  L.push('');
  L.push('Категория норматива → допустимые группы рациона (CAT_DIET):');
  L.push('');
  for (const [k, v] of Object.entries(CAT_DIET_OK)) L.push(`- ${k} → ${v.join(', ')}`);
  L.push('');
  L.push('Группа рациона → допустимые группы `food_group` записей КП, «other» КП допустима везде, рацион other не сверяется (TRANSFER_GROUP):');
  L.push('');
  for (const [k, v] of Object.entries(DIET_TR_OK)) L.push(`- ${k} → ${v.join(', ') || 'нет КП'}`);
  L.push('');
  L.push('Группа рациона → обязательный первый класс Codex/EU (CODEX):');
  L.push('');
  for (const [k, v] of Object.entries(CODEX_BY_DIET)) L.push(`- ${k} → ${v}`);
  L.push('');
  const TITLES = { CAT_DIET:'категория норматива ↔ группа рациона', CODEX:'класс Codex/EU ↔ группа рациона', TRANSFER_GROUP:'коэффициенты перехода не той группы', NO_CAT:'без категории норматива, но продукт приложению известен', DROPPED:'выпали из подсказок', SPLIT:'модификатор меняет результат механизмов' };
  const TYPES = ['CAT_DIET','CODEX','TRANSFER_GROUP','NO_CAT','DROPPED','SPLIT'];
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const dash = (v) => (v === null || v === undefined ? '—' : v);
  for (const t of TYPES) {
    const items = discrepancies.filter((d) => d.type === t);
    L.push(`## ${t} — ${TITLES[t]} (${items.length})`);
    L.push('');
    L.push('| Название | Категория | Норматив | Codex | Рацион | Подробности | Предложение | Решение оператора |');
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const it of items) {
      const cur = curByName.get(it.name);
      const cat = cur ? dash(cur.category) : '—';
      const norm = cur ? [cur.norm_fresh, cur.norm_dried].map(dash).join(' / ') : '—';
      const codex = cur ? (cur.codex_fresh ? cur.codex_fresh.join('/') : '—') : '—';
      const dietc = cur ? dash(cur.diet) : '—';
      L.push(`| ${esc(it.name)} | ${esc(cat)} | ${esc(norm)} | ${esc(codex)} | ${esc(dietc)} | ${esc(it.detail)} | ${esc(it.proposal)} | ${it.operator ? 'нужно' : 'техническое'} |`);
    }
    L.push('');
  }
  const { byType, a, b, c } = summary();
  L.push('## Сводка');
  L.push('');
  for (const t of TYPES) L.push(`- ${t}: ${byType[t]}`);
  L.push('');
  L.push(`названий: ${N}, записей словаря: ${list.length}, расхождений: ${a.size}, без категории: ${b.size}, нужно решение оператора: ${c.size}`);
  writeFileSync(file, L.join('\n') + '\n', 'utf8');
}

if (args.validate) {
  const list = readDraft(rel(args.validate));
  const errors = validate(list);
  for (const e of errors) console.log(e);
  console.log(`errors: ${errors.length}`);
  process.exit(errors.length > 0 ? 1 : 0);
}

const N = nameList.length;
const M = entries.length;
const errors = validate(entries);
if (errors.length) {
  for (const e of errors) console.error(e);
  console.error(`errors: ${errors.length}`);
  process.exit(1);
}
writeDraft(rel(args.out || 'data-src/products.draft.yaml'), entries, N);
if (args.report) writeReport(rel(args.report), entries, N);
const { byType, a, b, c } = summary();
console.log(JSON.stringify({ names: N, entries: M, discrepancies: a.size, no_category: b.size, operator: c.size, by_type: byType }));
process.exit(0);
