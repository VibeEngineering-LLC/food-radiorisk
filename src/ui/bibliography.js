import SOURCES from '../../public/data/sources.json' with { type: 'json' };
import { SOURCE_SHORT } from './form.js';

export const RISK_COEFF_SOURCE = 'NRB2009';
export const LIFE_SOURCES = ['ROSSTAT_DEMOG2023', 'WHO_MORTDB'];
export const RADON_SOURCES = ['DARBY2005', 'ICRP137'];
export const ORGAN_SOURCES = ['EPA_FGR13'];

export function canonicalId(id) {
    if (id == null) return null;
    const entry = SOURCES.sources?.[id];
    if (!entry) return null;
    if (entry.same_as && SOURCES.sources?.[entry.same_as]) {
        return entry.same_as;
    }
    return id;
}

export function usedSourceIds(result) {
    const ids = new Set();
    if (!result) return ids;

    // 1. result.rows[].provenance[].source
    const rows = result.rows || [];
    for (const row of rows) {
        const provs = row?.provenance || [];
        for (const p of provs) {
            if (p?.source) {
                const cid = canonicalId(p.source);
                if (cid) ids.add(cid);
            }
        }
    }

    // 2. Обход в глубину result.comparison: каждое строковое поле с именем `source`
    const comparison = result.comparison;
    if (comparison != null) {
        const stack = [comparison];
        while (stack.length) {
            const node = stack.pop();
            if (node == null || typeof node !== 'object') continue;
            if (Array.isArray(node)) {
                for (const item of node) stack.push(item);
                continue;
            }
            for (const key of Object.keys(node)) {
                if (key === 'source' && typeof node[key] === 'string') {
                    const val = node[key];
                    if (val === 'RADON_RISK') {
                        for (const s of RADON_SOURCES) {
                            const cid = canonicalId(s);
                            if (cid) ids.add(cid);
                        }
                    } else {
                        const cid = canonicalId(val);
                        if (cid) ids.add(cid);
                    }
                } else {
                    stack.push(node[key]);
                }
            }
        }
    }

    // 3. RISK_COEFF_SOURCE, если result.comparison или result.rows непустые
    const hasComparison = comparison != null && (
        (typeof comparison === 'object' && Object.keys(comparison).length > 0) ||
        (Array.isArray(comparison) && comparison.length > 0)
    );
    const hasRows = Array.isArray(rows) && rows.length > 0;
    if (hasComparison || hasRows) {
        const cid = canonicalId(RISK_COEFF_SOURCE);
        if (cid) ids.add(cid);
    }

    // 4. LIFE_SOURCES и RADON_SOURCES, если есть result.lifeRisks
    if (result.lifeRisks) {
        for (const s of LIFE_SOURCES) {
            const cid = canonicalId(s);
            if (cid) ids.add(cid);
        }
        for (const s of RADON_SOURCES) {
            const cid = canonicalId(s);
            if (cid) ids.add(cid);
        }
    }

    // 5. ORGAN_SOURCES, если result.organs или result.organRisk истинны
    if (result.organs || result.organRisk) {
        for (const s of ORGAN_SOURCES) {
            const cid = canonicalId(s);
            if (cid) ids.add(cid);
        }
    }

    return ids;
}

export function plainSource(id) {
    const cid = canonicalId(id);
    if (!cid) return SOURCE_SHORT[id] || id;
    const entry = SOURCES.sources?.[cid];
    if (!entry) return SOURCE_SHORT[cid] || cid;
    if (!entry.title_ru) return SOURCE_SHORT[cid] || cid;

    const parts = [entry.authors, entry.title_ru, entry.publisher, entry.year]
        .filter(v => v != null && String(v).trim() !== '')
        .map(v => String(v).replace(/\.\s*$/, '').trim());

    return parts.join('. ') + '.';
}

export function buildBibliography(result) {
    const sourceIds = usedSourceIds(result);
    const entries = [];

    // Записи из реестра
    for (const id of sourceIds) {
        const entry = SOURCES.sources?.[id] || {};
        entries.push({
            id,
            text: plainSource(id),
            doi: entry.doi || null,
            url: entry.url || null
        });
    }

    // Источники провенанса без записи в реестре (напр. ядерные данные, строка-описание) — тоже в списке, каждый один раз
    const seenFree = new Set();
    for (const row of result?.rows || []) {
        for (const p of row?.provenance || []) {
            if (typeof p?.source !== 'string' || canonicalId(p.source) || seenFree.has(p.source)) continue;
            seenFree.add(p.source);
            entries.push({ id: null, text: p.source, doi: null, url: null });
        }
    }

    // Нормативные документы
    const docArrays = [
        result?.limits?.ru,
        result?.limits?.foreign,
        result?.limits?.intervention
    ];
    const seenDocs = new Set();
    for (const arr of docArrays) {
        if (!Array.isArray(arr)) continue;
        for (const rec of arr) {
            const doc = typeof rec === 'string' ? rec : rec?.document; // в limits.* документ — поле document записи нормы
            if (typeof doc !== 'string' || doc.trim() === '') continue;
            if (seenDocs.has(doc)) continue;
            seenDocs.add(doc);
            entries.push({
                id: null,
                text: doc,
                doi: null,
                url: null
            });
        }
    }

    // Сортировка: сначала кириллица, затем латиница; внутри — localeCompare 'ru'
    const cyrillicRe = /^[А-Яа-яЁё]/;
    entries.sort((a, b) => {
        const aCyr = cyrillicRe.test(a.text);
        const bCyr = cyrillicRe.test(b.text);
        if (aCyr !== bCyr) return aCyr ? -1 : 1;
        return a.text.localeCompare(b.text, 'ru');
    });

    // Проставить n
    return entries.map((e, i) => ({
        n: i + 1,
        id: e.id,
        text: e.text,
        doi: e.doi,
        url: e.url
    }));
}
