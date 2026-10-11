// #FR-124 v51: охранный тест стиля текста (решения оператора 2026-10-11)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { loadJsx } from './render_helper.js';
import { REGIONS } from '../src/calc/region.js';
import { buildReport } from '../src/ui/report.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const TABS = ['sum', 'cmp', 'life', 'norms', 'calc', 'site', 'spec', 'src'];
const SC = [
  { id: 'milk', group: 'milk', name: 'молоко', nuc: [['Cs-137', 100, 10]], over: {} },
  { id: 'fish', group: 'fish', name: 'щука', nuc: [['Cs-137', 200, 20], ['Po-210', 5, 1]], over: {} },
  { id: 'mushrooms', group: 'mushrooms', name: 'белые грибы', nuc: [['Cs-137', 500, 50]], over: {} },
  { id: 'child', group: 'milk', name: 'молоко', nuc: [['Cs-137', 100, 10], ['Sr-90', 10, 1]], over: { age: '5y' } },
];

function toText(html) {
  let s = String(html);
  const startIdx = s.indexOf('<h2 id="limits"');
  const endIdx = s.indexOf('<h2 id="licenses"');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    s = s.slice(0, startIdx) + s.slice(endIdx);
  }
  s = s.replace(/<[^>]*>/g, ' ');
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00A0');
  return s;
}

const RULES = [
  { name: 'ваш', re: /(?<![а-яё])ваш/iu },
  { name: 'вы едите', re: /вы едите/iu },
  { name: 'вердикт', re: /вердикт/iu },
  { name: 'нуклид без радио', re: /(?<![а-яё])нуклид/iu },
  { name: 'Bq/kg', re: /Bq\/kg/u },
  { name: 'Other,', re: /Other,/u },
  { name: 'иероглифы', re: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u },
  { name: 'латиница в кириллическом слове', re: /(?<=[а-яё])[a-z]|[a-z](?=[а-яё])/iu },
  { name: 'сухую/свежую масса', re: /(сухую|свежую) масса/iu },
  { name: 'значки уровня', re: /✅|⚠/u },
  { name: 'вес продукта', re: /вес продукта|сырой вес/iu },
  { name: 'число и единица через обычный пробел', re: /\d (?:мкЗв|мЗв|Зв|кБк|Бк|кг|%|мин|сут)(?![а-яё])|\d [гч](?![а-яё])/u },
];

function findDefects(text) {
  const out = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + m[0].length + 30);
      const ctx = text.slice(start, end).replace(/\s+/g, ' ').trim();
      out.push(`${rule.name}: ...${ctx}...`);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

test('FR-124: на всех вкладках экрана, в обоих регионах и сценариях нет дефектов стиля', async (t) => {
  const { renderRaw: render, done } = await loadJsx('src/react/Result.jsx', 'default'); // разметка как есть, с U+00A0
  const map = new Map();
  try {
    for (const region of REGIONS) {
      for (const sc of SC) {
        const input = inputFor(sc.group, sc.name, sc.nuc, { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...sc.over });
        const result = computeScenario(data, input);
        for (const tab of TABS) {
          const html = render({ result, input, meta: META, initialTab: tab });
          const defects = findDefects(toText(html));
          for (const d of defects) {
            if (!map.has(d)) map.set(d, `${region}/${sc.id}/${tab}`);
          }
        }
      }
    }
    if (map.size > 0) {
      const entries = [...map.entries()].slice(0, 40).map(([d, p]) => `${p}: ${d}`).join('\n');
      assert.equal(map.size, 0, `Обнаружены дефекты стиля:\n${entries}`);
    }
  } finally {
    done();
  }
});

test('FR-124: в отчётах md и html нет дефектов стиля', async (t) => {
  const map = new Map();
  for (const region of REGIONS) {
    for (const sc of SC) {
      const input = inputFor(sc.group, sc.name, sc.nuc, { portionKg: 0.5, portionsPerYear: 365, years: 1, region, ...sc.over });
      const result = computeScenario(data, input);
      for (const format of ['md', 'html']) {
        const raw = buildReport(format, { input, result }, META, '2026-10-10T12:00:00.000Z').text;
        const text = format === 'html' ? toText(raw) : raw;
        const defects = findDefects(text);
        for (const d of defects) {
          if (!map.has(d)) map.set(d, `${region}/${sc.id}/${format}`);
        }
      }
    }
  }
  if (map.size > 0) {
    const entries = [...map.entries()].slice(0, 40).map(([d, p]) => `${p}: ${d}`).join('\n');
    assert.equal(map.size, 0, `Обнаружены дефекты стиля в отчётах:\n${entries}`);
  }
});

test('FR-124: тест умеет краснеть', (t) => {
  const badStrings = [
    'ваш личный риск',
    'Это вы едите',
    'вердикт: не соответствует',
    'нуклид цезий',
    'единица Bq/kg',
    'Other, подсолнечник',
    'изобразить 乳児',
    'Рadin А.И.',
    'принята сухую масса',
    'уровень ✅',
    'сырой вес',
    'доза 10 мкЗв',
  ];
  for (const s of badStrings) {
    const defects = findDefects(s);
    assert.ok(defects.length > 0, `Ожидался дефект для строки: "${s}"`);
  }

  const goodStrings = [
    'радионуклид цезий-137',
    'доза 10\u00A0мкЗв',
    'Известная масса',
    'принята сухая масса',
    'Fr = 1; A/УВ; Cs-137',
    'заключение: соответствует',
  ];
  for (const s of goodStrings) {
    const defects = findDefects(s);
    assert.equal(defects.length, 0, `Не ожидался дефект для строки: "${s}", но найдено: ${defects.join(', ')}`);
  }
});
