// Прогон разбора заголовка .spe по реальной папке ЛСРМ (только чтение): node tools/spe_check.mjs "<папка Spe>"
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeSpe, parseSpeHeader, speToForm } from '../src/ui/spe.js';
const dir = process.argv[2];
const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.spe'));
const stat = { files: files.length, noDate: 0, noShifr: 0, noK: 0, kNot1: 0, types: {} }, samples = [];
for (const f of files) {
  const h = parseSpeHeader(decodeSpe(readFileSync(join(dir, f))));
  const x = speToForm(h);
  if (!h.measBegin) stat.noDate++;
  if (!h.shifr) stat.noShifr++;
  if (x.k === null) stat.noK++; else if (x.k !== 1) stat.kNot1++;
  stat.types[h.type || '(пусто)'] = (stat.types[h.type || '(пусто)'] || 0) + 1;
  if (samples.length < 8 && h.type === 'Образец') samples.push([h.shifr, x.product, h.measBegin, x.rawMassG, x.probeMassG, x.sampleMassG, x.k]);
}
console.log(JSON.stringify({ stat, samples }, null, 1));
