// #FR-106 v46: охранный тест — в предупреждениях и источниках расчёта с обработкой/переходом нет внутренних маркеров (пути .md/.pdf, audit/, #FR, D-0N, gaps-, оператор, «текстового слоя», внутренние id записей данных)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { loadJsx } from './render_helper.js';
import { REGIONS } from '../src/calc/region.js';
import { buildReport } from '../src/ui/report.js';
import { locRu } from '../src/ui/ru.js';

const META = { datasets: 3, records: 9, sha: 'abcdef0123456789' };
const MARK = /\.md\b|\.pdf\b|audit\/|fr1\d\d|#FR|D-0\d|gaps-|оператор|текстового слоя|\b(?:lysenko|trs|tec|melchenko|marey|gudkov|golovkina|nevdakh|varfolomeeva|vasilenko|panchenko|yanin|otvety|uddin|unscear|mchs)\d*[a-z]*\d*_[a-z0-9_]+/i;

const ALL_IDS = [...data.processing, ...data.transfer].map(r => r.id).filter(Boolean);

// Функция поиска маркеров в HTML-тексте
function findMarkers(html) {
  const found = [];
  // Убираем теги
  // URL публичных источников (…/file.pdf) — законный адрес, не файловый путь
  let text = html.replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  // Декодируем HTML-сущности
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Ищем совпадения с регулярным выражением MARK
  const markGlobal = new RegExp(MARK.source, 'gi');
  let m;
  while ((m = markGlobal.exec(text)) !== null) {
    const start = Math.max(0, m.index - 30);
    const end = Math.min(text.length, m.index + m[0].length + 30);
    found.push(`text: ${text.slice(start, end)}`);
  }

  // Проверяем id записей (быстрая проверка перед циклом)
  if (/_[a-z0-9]+_/.test(text)) {
    for (const id of ALL_IDS) {
      if (text.includes(id)) {
        found.push(`id: ${id}`);
      }
    }
  }

  // Сканируем атрибуты title, aria-label, data-*
  const attrRegex = /\s(title|aria-label|data-[\w-]+)="([^"]*)"/g;
  let am;
  while ((am = attrRegex.exec(html)) !== null) {
    const name = am[1];
    let value = am[2]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    
    // Проверяем MARK в атрибуте
    const markGlobalAttr = new RegExp(MARK.source, 'gi');
    if (markGlobalAttr.test(value)) {
      found.push(`attr ${name}: ${value.slice(0, 60)}`);
    }
    
    // Проверяем id в атрибуте
    if (/_[a-z0-9]+_/.test(value)) {
      for (const id of ALL_IDS) {
        if (value.includes(id)) {
          found.push(`attr ${name}: ${value.slice(0, 60)}`);
          break;
        }
      }
    }
  }

  return found;
}

test('FR-106 v46: все записи обработки × Cs-137/Sr-90/I-131 × оба региона — на «Сводке» и «Подробном расчёте» нет внутренних маркеров', { timeout: 600000 }, async () => {
  const { render, done } = await loadJsx('src/react/Result.jsx', 'default');
  try {
    const markerMap = new Map();
    
    for (const region of REGIONS) {
      const records = data.processing.filter(r => r.quantity === 'Fr');
      for (const rec of records) {
        for (const nuc of ['Cs-137', 'Sr-90', 'I-131']) {
          for (const variant of ['best', 'max']) {
            const input = inputFor('milk', 'молоко', [[nuc, 100, 10]], {
              portionKg: 0.5,
              portionsPerYear: 365,
              years: 1,
              region,
              processing: {
                mode: 'record',
                recordIds: [rec.id],
                variant
              }
            });
            
            let result;
            try {
              result = computeScenario(data, input);
            } catch (e) {
              // Проверяем маркеры в сообщении об ошибке
              const errText = String(e.message);
              const markers = findMarkers(errText);
              const key = `${region}/${rec.id}/${nuc}/error`;
              for (const mk of markers) {
                if (!markerMap.has(mk)) {
                  markerMap.set(mk, key);
                }
              }
              continue;
            }
            
            // Проверяем вкладки
            for (const tab of ['sum', 'calc']) {
              const html = render({ result, input, meta: META, initialTab: tab });
              const markers = findMarkers(html);
              const key = `${region}/${rec.id}/${nuc}/${tab}`;
              for (const mk of markers) {
                if (!markerMap.has(mk)) {
                  markerMap.set(mk, key);
                }
              }
            }
            
            // Проверяем предупреждения
            const warningsText = (result.warnings || []).join(' | ');
            if (warningsText) {
              const markers = findMarkers(warningsText);
              const key = `${region}/${rec.id}/${nuc}/warn`;
              for (const mk of markers) {
                if (!markerMap.has(mk)) {
                  markerMap.set(mk, key);
                }
              }
            }
          }
        }
      }
    }
    
    assert.equal(markerMap.size, 0, 'Найдены маркеры: ' + [...markerMap.entries()].slice(0, 20).map(([k, v]) => v + ': ' + k).join('; '));
  } finally {
    done();
  }
});

test('FR-106 v46: отчёты md и html для всех записей обработки без маркеров', { timeout: 600000 }, async () => {
  const markerMap = new Map();
  
  for (const region of REGIONS) {
    const records = data.processing.filter(r => r.quantity === 'Fr');
    for (const rec of records) {
      for (const nuc of ['Cs-137', 'Sr-90']) {
        const input = inputFor('milk', 'молоко', [[nuc, 100, 10]], {
          portionKg: 0.5,
          portionsPerYear: 365,
          years: 1,
          region,
          processing: {
            mode: 'record',
            recordIds: [rec.id],
            variant: 'best'
          }
        });
        
        let result;
        try {
          result = computeScenario(data, input);
        } catch (e) {
          continue;
        }
        
        for (const format of ['md', 'html']) {
          const out = buildReport(format, { input, result }, META, '2026-10-10T12:00:00.000Z');
          const markers = findMarkers(out.text);
          const key = `${region}/${rec.id}/${nuc}/${format}`;
          for (const mk of markers) {
            if (!markerMap.has(mk)) {
              markerMap.set(mk, key);
            }
          }
        }
      }
    }
  }
  
  assert.equal(markerMap.size, 0, 'Найдены маркеры: ' + [...markerMap.entries()].slice(0, 20).map(([k, v]) => v + ': ' + k).join('; '));
});

test('FR-106 v46: переходы с аномалией/без проверки — маркеров нет', { timeout: 600000 }, async () => {
  const { render, done } = await loadJsx('src/react/Result.jsx', 'default');
  try {
    const markerMap = new Map();
    const transfers = data.transfer.filter(r => r.source_anomaly || r.level !== '✅' || r.mass_basis_status === 'assumed' || r.mass_basis_status === 'inferred');
    
    for (const rec of transfers) {
      for (const region of REGIONS) {
        const input = inputFor('milk', 'молоко', [['Cs-137', 100, 10]], {
          portionKg: 0.5,
          portionsPerYear: 365,
          years: 1,
          region
        });
        
        // Вариант A: deposition
        input.nuclides = [{
          nuclide: 'Cs-137',
          source: 'deposition',
          measuredBqPerKg: null,
          measuredUncertaintyBqPerKg: 0,
          sampleDate: null,
          depositionKBqPerM2: 10,
          depositionDate: null,
          transferId: rec.id,
          variant: 'central',
          samplePrep: { mode: 'as_is', concentrationFactor: 1 }
        }];

        let resultA;
        try {
          resultA = computeScenario(data, input);
        } catch (e) {
          const errText = String(e.message);
          const markers = findMarkers(errText);
          const key = `${region}/${rec.id}/A/error`;
          for (const mk of markers) {
            if (!markerMap.has(mk)) {
              markerMap.set(mk, key);
            }
          }
        }
        
        if (resultA) {
          for (const tab of ['sum', 'calc']) {
            const html = render({ result: resultA, input, meta: META, initialTab: tab });
            const markers = findMarkers(html);
            const key = `${region}/${rec.id}/A/${tab}`;
            for (const mk of markers) {
              if (!markerMap.has(mk)) {
                markerMap.set(mk, key);
              }
            }
          }
          const warningsText = (resultA.warnings || []).join(' | ');
          if (warningsText) {
            const markers = findMarkers(warningsText);
            const key = `${region}/${rec.id}/A/warn`;
            for (const mk of markers) {
              if (!markerMap.has(mk)) {
                markerMap.set(mk, key);
              }
            }
          }
        }
        
        // Вариант B: measured
        input.nuclides = [{
          nuclide: 'Cs-137',
          source: 'measured',
          measuredBqPerKg: 100,
          measuredUncertaintyBqPerKg: 10,
          transferId: rec.id,
          variant: 'central',
          samplePrep: { mode: 'as_is', concentrationFactor: 1 }
        }];

        let resultB;
        try {
          resultB = computeScenario(data, input);
        } catch (e) {
          const errText = String(e.message);
          const markers = findMarkers(errText);
          const key = `${region}/${rec.id}/B/error`;
          for (const mk of markers) {
            if (!markerMap.has(mk)) {
              markerMap.set(mk, key);
            }
          }
        }
        
        if (resultB) {
          for (const tab of ['sum', 'calc']) {
            const html = render({ result: resultB, input, meta: META, initialTab: tab });
            const markers = findMarkers(html);
            const key = `${region}/${rec.id}/B/${tab}`;
            for (const mk of markers) {
              if (!markerMap.has(mk)) {
                markerMap.set(mk, key);
              }
            }
          }
          const warningsText = (resultB.warnings || []).join(' | ');
          if (warningsText) {
            const markers = findMarkers(warningsText);
            const key = `${region}/${rec.id}/B/warn`;
            for (const mk of markers) {
              if (!markerMap.has(mk)) {
                markerMap.set(mk, key);
              }
            }
          }
        }
      }
    }
    
    assert.equal(markerMap.size, 0, 'Найдены маркеры: ' + [...markerMap.entries()].slice(0, 20).map(([k, v]) => v + ': ' + k).join('; '));
  } finally {
    done();
  }
});

test('FR-106 v46: тест умеет краснеть', () => {
  assert.ok(findMarkers('<p>Учебник.pdf.md:11751-11753</p>').length > 0);
  assert.ok(findMarkers('<p>строка 100 текстового слоя</p>').length > 0);
  assert.ok(findMarkers('<p>коэффициент trs472_fv_po_leguminous_fodder_stems_and_shoots_all</p>').length > 0);
  assert.equal(findMarkers('<p>с. 54 (PDF p.65)</p>').length, 0);
  // locRu вырезает файловые пути .pdf.md с номерами строк
  assert.equal(locRu('Учебник по радиобиологии.pdf.md:11751-11753'), '');
  assert.equal(locRu('Table 69, TRS-472 book p.147; Учебник.pdf.md:11751-11753'), 'табл. 69, с. 147');
  if (ALL_IDS.length > 0) {
    assert.ok(findMarkers(`<p>x ${ALL_IDS[0]} y</p>`).length > 0);
  }
});
