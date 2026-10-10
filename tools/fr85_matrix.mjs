import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const url = (rel) => pathToFileURL(join(root, rel)).href;

function parseArgs(argv) {
  const args = argv.slice(2);
  const mode = args[0];
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') opts.out = args[++i];
    else if (a === '--names') opts.names = args[++i];
    else if (a === '--before') opts.before = args[++i];
    else if (a === '--after') opts.after = args[++i];
  }
  return { mode, opts };
}

function writeOut(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 1), 'utf8');
}

function sortedDistinct(arr) {
  return [...new Set(arr)].sort();
}

function arrayEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return JSON.stringify(sa) === JSON.stringify(sb);
}

function diffArrays(before, after) {
  const bSet = new Set(before);
  const aSet = new Set(after);
  const lost = before.filter((x) => !aSet.has(x));
  const gained = after.filter((x) => !bSet.has(x));
  return { lost, gained };
}

async function main() {
  const { mode, opts } = parseArgs(process.argv);

  if (!['old', 'new', 'diff'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }

  if (!opts.out) {
    throw new Error('Missing required argument: --out');
  }

  if (mode === 'old') {
    const { loadAll } = await import(url('src/data/loader.js'));
    const { data } = await loadAll((p) => JSON.parse(readFileSync(join(root, p), 'utf8')), 'public/data/');
    const { listChoices } = await import(url('src/calc/model.js'));
    const choices = listChoices(data);

    const { categoryOf, limitGroupFor, dryMatterFor, dryingFactorFor } = await import(url('src/calc/catalog.js'));
    const { pickNormRecord } = await import(url('src/calc/norms.js'));
    const { productClasses } = await import(url('src/calc/foodclass.js'));
    const { dietDefaultFor } = await import(url('src/calc/diet.js'));
    const { transferOptions, productNames } = await import(url('src/ui/product.js'));
    const { processingOptions, COMMON_PRODUCTS } = await import(url('src/ui/form.js'));
    const { cleanProductNames } = await import(url('src/ui/suggest.js'));

    // 1. appNames
    const appNames = cleanProductNames(
      productNames(choices),
      (n) => !!categoryOf(n),
      COMMON_PRODUCTS
    );

    // 2. dataNames
    const dataNames = cleanProductNames(
      productNames({ transfer: data.transfer }).concat(
        data.processing.map((r) => String(r.food || '').split(',')[0].trim()).filter((n) => /[а-яё]/i.test(n))
      ),
      (n) => !!categoryOf(n),
      []
    );

    // 3. extra84
    let extra84Names = [];
    try {
      const extra84Data = JSON.parse(readFileSync(join(root, 'tests/fixtures/fr84_matrix_extra.json'), 'utf8'));
      if (Array.isArray(extra84Data.names)) {
        extra84Names = extra84Data.names.map((pair) => Array.isArray(pair) ? pair[0] : pair).filter((n) => typeof n === 'string');
      }
    } catch (e) {
      // ignore if file missing
    }

    // 4. extra83
    let extra83Names = [];
    try {
      const extra83Data = JSON.parse(readFileSync(join(root, 'tests/fixtures/fr83_matrix_extra.json'), 'utf8'));
      if (Array.isArray(extra83Data.names)) {
        extra83Names = extra83Data.names.map((pair) => Array.isArray(pair) ? pair[0] : pair).filter((n) => typeof n === 'string');
      }
    } catch (e) {
      // ignore if file missing
    }

    // Build list of { name, src }
    const nameList = [];
    const seen = new Set();

    const addName = (n, src) => {
      if (typeof n !== 'string' || !n) return;
      if (!seen.has(n)) {
        seen.add(n);
        nameList.push({ name: n, src });
      }
    };

    appNames.forEach((n) => addName(n, 'app'));
    dataNames.forEach((n) => addName(n, 'data'));
    extra84Names.forEach((n) => addName(n, 'extra84'));
    extra83Names.forEach((n) => addName(n, 'extra83'));

    const rows = [];
    for (const { name: n, src } of nameList) {
      const cat = categoryOf(n);
      const code_f = limitGroupFor(cat, 'fresh', n);
      const code_d = limitGroupFor(cat, 'dried', n);

      const norm = (code, nuc, st) => (code ? (pickNormRecord(data.limits_ru, code, nuc, n, st).rec?.id ?? null) : null);

      const d = dietDefaultFor(data.diet, { productName: n, state: 'fresh', age: 'adult', lifetime: null, mode: 'default' });
      const tr = transferOptions(choices, 'Cs-137', n);
      const proc = processingOptions(choices, 'Cs-137', cat);

      const tr_ids = tr.groups.flatMap((g) => g.items.map((i) => i.id)).sort();
      const proc_ids = proc.map((o) => o.value);
      const proc_groups = sortedDistinct(
        choices.processing.filter((r) => proc_ids.includes(r.id)).map((r) => r.food_group)
      );

      rows.push({
        name: n,
        src,
        code_f: code_f || null,
        code_d: code_d || null,
        norm_f: norm(code_f, 'Cs-137', 'fresh'),
        norm_d: norm(code_d, 'Cs-137', 'dried'),
        sr_f: norm(code_f, 'Sr-90', 'fresh'),
        codex: productClasses(code_f, n, 'fresh'),
        diet_group: d.group?.code ?? null,
        diet_status: d.status,
        diet_direction: d.group?.direction ?? null,
        diet_rec: d.rec?.id ?? null,
        dry: dryMatterFor(choices.dryMatter, n)?.id ?? null,
        df: dryingFactorFor(data.limits_ru, cat)?.value ?? null,
        tr_ids,
        tr_fallback: !!tr.fallback,
        proc_groups,
        suggest: appNames.includes(n),
        match: null,
        entry: null
      });
    }

    const outObj = { mode: 'old', count: rows.length, rows };
    writeOut(opts.out, outObj);
    console.log(`old: ${rows.length} names -> ${opts.out}`);

  } else if (mode === 'new') {
    if (!opts.names) {
      throw new Error('Missing required argument: --names');
    }

    const { loadAll } = await import(url('src/data/loader.js'));
    const { data } = await loadAll((p) => JSON.parse(readFileSync(join(root, p), 'utf8')), 'public/data/');
    const { listChoices } = await import(url('src/calc/model.js'));
    const choices = listChoices(data);

    const { matchProduct, normIdFor, productSuggestions } = await import(url('src/calc/products.js'));
    const { normCodeFor, dryMatterFor, dryingFactorFor } = await import(url('src/calc/catalog.js'));
    const { pickNormRecord } = await import(url('src/calc/norms.js'));
    const { classesFor } = await import(url('src/calc/foodclass.js'));
    const { dietDefaultFor } = await import(url('src/calc/diet.js'));
    const { transferOptions } = await import(url('src/ui/product.js'));
    const { processingOptions } = await import(url('src/ui/form.js'));

    const namesData = JSON.parse(readFileSync(join(root, opts.names), 'utf8'));
    const nameList = namesData.rows.map((r) => ({ name: r.name, src: r.src }));

    const sugg = productSuggestions(choices.products);

    const rows = [];
    for (const { name: n, src } of nameList) {
      const m = matchProduct(choices.products, n);
      const e = m.status === 'ok' ? m.entry : null;

      const code_f = normCodeFor(data.limits_ru, e, 'fresh');
      const code_d = normCodeFor(data.limits_ru, e, 'dried');

      const norm = (code, nuc, st) => (code ? (pickNormRecord(data.limits_ru, code, nuc, normIdFor(e, st, nuc), st).rec?.id ?? null) : null);

      const d = dietDefaultFor(data.diet, { productName: n, state: 'fresh', age: 'adult', lifetime: null, mode: 'default', products: choices.products });
      const tr = transferOptions(choices, 'Cs-137', n);
      const proc = processingOptions(choices, 'Cs-137', e);

      const tr_ids = tr.groups.flatMap((g) => g.items.map((i) => i.id)).sort();
      const proc_ids = proc.map((o) => o.value);
      const proc_groups = sortedDistinct(
        choices.processing.filter((r) => proc_ids.includes(r.id)).map((r) => r.food_group)
      );

      rows.push({
        name: n,
        src,
        code_f: code_f || null,
        code_d: code_d || null,
        norm_f: norm(code_f, 'Cs-137', 'fresh'),
        norm_d: norm(code_d, 'Cs-137', 'dried'),
        sr_f: norm(code_f, 'Sr-90', 'fresh'),
        codex: classesFor(e, code_f, code_f),
        diet_group: d.group?.code ?? null,
        diet_status: d.status,
        diet_direction: d.group?.direction ?? null,
        diet_rec: d.rec?.id ?? null,
        dry: dryMatterFor(choices.dryMatter, e)?.id ?? null,
        df: dryingFactorFor(data.limits_ru, e)?.value ?? null,
        tr_ids,
        tr_fallback: !!tr.fallback,
        proc_groups,
        suggest: sugg.includes(n),
        match: m.status,
        entry: e ? e.id : null
      });
    }

    const outObj = { mode: 'new', count: rows.length, rows };
    writeOut(opts.out, outObj);
    console.log(`new: ${rows.length} names -> ${opts.out}`);

  } else if (mode === 'diff') {
    if (!opts.before || !opts.after) {
      throw new Error('Missing required arguments: --before and --after');
    }

    const before = JSON.parse(readFileSync(join(root, opts.before), 'utf8'));
    const after = JSON.parse(readFileSync(join(root, opts.after), 'utf8'));

    const afterMap = new Map();
    after.rows.forEach((r) => afterMap.set(r.name, r));

    const changes = [];
    const changedNames = new Set();
    const byField = {};

    const fields = ['code_f', 'code_d', 'norm_f', 'norm_d', 'sr_f', 'codex', 'diet_group', 'diet_status', 'diet_direction', 'dry', 'df', 'tr_ids', 'tr_fallback', 'proc_groups', 'suggest'];

    for (const bRow of before.rows) {
      const aRow = afterMap.get(bRow.name);
      if (!aRow) {
        changes.push({
          name: bRow.name,
          field: 'row',
          before: 'present',
          after: 'missing',
          entry: null,
          match: null
        });
        changedNames.add(bRow.name);
        byField['row'] = (byField['row'] || 0) + 1;
        continue;
      }

      for (const f of fields) {
        const bVal = bRow[f];
        const aVal = aRow[f];

        let isDiff = false;
        if (Array.isArray(bVal) && Array.isArray(aVal)) {
          isDiff = !arrayEqual(bVal, aVal);
        } else {
          isDiff = bVal !== aVal;
        }

        if (isDiff) {
          changedNames.add(bRow.name);
          byField[f] = (byField[f] || 0) + 1;

          if (f === 'tr_ids') {
            const { lost, gained } = diffArrays(bVal, aVal);
            changes.push({
              name: bRow.name,
              field: f,
              before: bVal.length,
              after: aVal.length,
              lost,
              gained,
              entry: aRow.entry,
              match: aRow.match
            });
          } else {
            changes.push({
              name: bRow.name,
              field: f,
              before: bVal,
              after: aVal,
              entry: aRow.entry,
              match: aRow.match
            });
          }
        }
      }
    }

    const outObj = {
      mode: 'diff',
      names: before.rows.length,
      changed_names: changedNames.size,
      by_field: byField,
      changes
    };

    writeOut(opts.out, outObj);
    console.log(`diff: ${changedNames.size} of ${before.rows.length} names changed -> ${opts.out}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
