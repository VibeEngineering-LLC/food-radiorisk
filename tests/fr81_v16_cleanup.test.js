// #FR-81 V16: чистка — удалённые имена (уровень НРБ по Ē₅, выбор коэффициента, блок RiskBlock) не остались в src/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../src/', import.meta.url));

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor') continue;
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (['.js', '.jsx', '.ts'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

test('V16: удалённые имена не встречаются в исходниках src/', async () => {
  const names = ['RISK_TXT', 'logPos', 'riskCoeffNote', 'riskAssessment', 'riskAvg5', 'negligibleShare', 'RiskBlock', 'RiskBox', 'budgetShare1mSv\\b'];
  const files = await walk(root);
  const excludeSuffix = 'ui' + path.sep + 'form.js';
  
  for (const f of files) {
    if (f.endsWith(excludeSuffix)) continue;
    const text = await readFile(f, 'utf8');
    for (const n of names) {
      assert.doesNotMatch(text, new RegExp(n), `${path.basename(f)}: ${n}`);
    }
  }
});
