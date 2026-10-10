import { newRussianStemmer } from './snowball_ru.js';
import { buildLexExtras, isNeutral, absorbsGeneric, specificCount, findBlockers, regroupFor } from './products_neutral.js';

const ruStemmer = newRussianStemmer();

// #FR-85 v17 (D-027 п. 1): слова словаря с короткой основой (<= SHORT_STEM букв) сопоставляются не по основе, а по падежным формам самого слова;
// иначе «налив» = «налим», «репей» = «репа», «медь» = «мёд» (общая основа). Формы строятся по последней букве слова словаря.
export const SHORT_STEM = 5;
const END_ADJ = ['ый', 'ой', 'ий', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ого', 'его', 'ому', 'ему', 'ым', 'им', 'ом', 'ем', 'ую', 'юю', 'ых', 'их', 'ыми', 'ими', 'ей'];
const END_BY_LAST = { 'а': ['а', 'ы', 'и', 'е', 'у', 'ой', 'ою', 'ам', 'ами', 'ах', '', 'ов', 'ев'], 'я': ['я', 'и', 'е', 'ю', 'ей', 'ею', 'ям', 'ями', 'ях', 'ев'],
    'о': ['о', 'а', 'у', 'ом', 'е', 'ам', 'ами', 'ах', ''], 'е': ['е', 'я', 'ю', 'ем', 'ям', 'ями', 'ях', ''], 'ь': ['ь', 'и', 'ью', 'я', 'ю', 'ем', 'е', 'ей', 'ям', 'ями', 'ях'],
    'й': ['й', 'я', 'ю', 'ем', 'е', 'и', 'ев', 'ям', 'ями', 'ях', 'ей'], 'ы': ['ы', 'ов', 'ам', 'ами', 'ах', 'и'], 'и': ['и', 'ей', 'ям', 'ями', 'ях', 'ов', 'ам', 'ами', 'ах', 'ы'] };
const END_CONS = ['', 'а', 'у', 'ом', 'е', 'ы', 'и', 'ов', 'ам', 'ами', 'ах', 'ем', 'ей'];
export function wordForms(w) {
    const out = new Set([w]);
    const adj = /(ый|ой|ий|ая|яя|ое|ее|ые|ие)$/.exec(w);
    const add = (base, ends) => { for (const e of ends) out.add(base + e); };
    if (adj && w.length >= 5) add(w.slice(0, -adj[1].length), END_ADJ);
    else if (END_BY_LAST[w.slice(-1)]) add(w.slice(0, -1), END_BY_LAST[w.slice(-1)]);
    else { add(w, END_CONS); if (/(ок|ек|ец)$/.test(w)) add(w.slice(0, -2) + w.slice(-1), END_CONS.slice(1)); }
    if (/[цжчшщ]а$/.test(w)) out.add(w.slice(0, -1) + 'ей'); // курица -> курицей (творительный на шипящую/ц)
    return out;
}

// Кэш для мемоизации стемминга
const stemCache = new Map();

// Кэш индексов по массиву записей
const indexCache = new WeakMap();

/**
 * Нормализация имени: приведение к нижнему регистру, замена ё на е,
 * удаление содержимого в скобках, замена разделителей на пробел.
 * @param {string} s - исходная строка
 * @returns {string} нормализованная строка
 */
export function normalizeName(s) {
    let str = String(s ?? '');
    str = str.toLowerCase();
    str = str.replace(/ё/g, 'е');
    str = str.replace(/\([^)]*\)/g, ' ');
    str = str.replace(/[\s,.;:()_\-\/]+/g, ' ');
    return str.trim();
}

/**
 * Разбиение нормализованной строки на слова.
 * @param {string} s - исходная строка
 * @returns {string[]} массив слов
 */
export function wordsOf(s) {
    return normalizeName(s).split(' ').filter(Boolean);
}

/**
 * Создание ключа из массива слов (сортировка и объединение).
 * @param {string[]} words - массив слов
 * @returns {string} ключ
 */
export function keyOf(words) {
    return words.slice().sort().join(' ');
}

/**
 * Стемминг русского слова с мемоизацией.
 * @param {string} word - слово
 * @returns {string} стем
 */
export function stemRu(word) {
    const w = String(word);
    if (stemCache.has(w)) {
        return stemCache.get(w);
    }
    const result = ruStemmer.stem(w);
    stemCache.set(w, result);
    return result;
}

/**
 * Построение индекса по записям.
 * @param {Array} records - массив записей
 * @returns {object} объект индекса
 */
export function buildIndex(records) {
    // Если records не массив, возвращаем пустой индекс
    if (!Array.isArray(records)) {
        return {
            modifiers: new Map(),
            stop: new Set(),
            forms: new Map(),
            tok: (w) => stemRu(w),
            extras: buildLexExtras(null, normalizeName, stemRu),
            products: [],
            syns: [],
            byKey: new Map()
        };
    }

    // Проверяем кэш
    if (indexCache.has(records)) {
        return indexCache.get(records);
    }

    const modifiers = new Map();
    const stop = new Set();
    const forms = new Map();
    const products = [];
    const syns = [];
    const byKey = new Map();

    // Лексикон (первая запись kind: lexicon) — до синонимов: стоп-слова и особые формы слов (вместо стеммера)
    const lex = records.find(r => r && r.kind === 'lexicon');
    for (const w of Array.isArray(lex?.stopwords) ? lex.stopwords : []) { const n = normalizeName(w); if (n) stop.add(n); }
    for (const [w, t] of Object.entries(lex?.forms && typeof lex.forms === 'object' ? lex.forms : {})) { const n = normalizeName(w); if (n) forms.set(n, t); }

    // #FR-85 v17: короткие основы слов словаря -> допустимые формы (слова lexicon.forms идут по своей таблице)
    const shortForms = new Map();
    for (const rec of records) {
        if (!rec || (rec.kind !== 'product' && rec.kind !== 'choice') || !Array.isArray(rec.synonyms)) continue;
        for (const syn of rec.synonyms) for (const w of wordsOf(syn)) {
            const st = stemRu(w);
            if (stop.has(w) || forms.has(w) || st.length > SHORT_STEM || !/^[а-я]+$/.test(w)) continue;
            if (!shortForms.has(st)) shortForms.set(st, new Set());
            for (const f of wordForms(w)) shortForms.get(st).add(f);
        }
    }
    const tokOf = (w) => {
        if (forms.has(w)) return forms.get(w);
        const st = stemRu(w);
        return shortForms.has(st) && !shortForms.get(st).has(w) ? '!' + w : st;
    };

    // Обработка записей
    for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;

        if (rec.kind === 'modifier') {
            if (Array.isArray(rec.words)) {
                for (const w of rec.words) {
                    const normW = normalizeName(w);
                    if (normW) {
                        modifiers.set(normW, rec.state);
                    }
                }
            }
        } else if (rec.kind === 'product') {
            products.push(rec);
            if (Array.isArray(rec.synonyms)) {
                for (const syn of rec.synonyms) {
                    const words = wordsOf(syn).filter(w => !stop.has(w));
                    if (words.length === 0) continue;
                    
                    const tokens = words.map(tokOf);
                    const key = keyOf(tokens);
                    
                    const synObj = {
                        owner: rec,
                        entries: [rec],
                        synonym: syn,
                        words: words,
                        tokens: tokens,
                        key: key
                    };
                    
                    syns.push(synObj);
                    
                    if (!byKey.has(key)) {
                        byKey.set(key, []);
                    }
                    byKey.get(key).push(synObj);
                }
            }
        }
    }
    // Записи-выборы — вторым проходом: варианты ссылаются на продукты, которые могут стоять в файле позже
    for (const rec of records) {
        if (rec && rec.kind === 'choice') {
            // Проверяем опции
            if (!Array.isArray(rec.options)) continue;
            
            const optionRecords = [];
            for (const optId of rec.options) {
                const found = products.find(p => p.id === optId);
                if (found) {
                    optionRecords.push(found);
                }
            }
            
            // Если меньше 2 записей, пропускаем
            if (optionRecords.length < 2) continue;
            
            if (Array.isArray(rec.synonyms)) {
                for (const syn of rec.synonyms) {
                    const words = wordsOf(syn).filter(w => !stop.has(w));
                    if (words.length === 0) continue;
                    
                    const tokens = words.map(tokOf);
                    const key = keyOf(tokens);
                    
                    const synObj = {
                        owner: rec,
                        entries: optionRecords,
                        synonym: syn,
                        words: words,
                        tokens: tokens,
                        key: key
                    };
                    
                    syns.push(synObj);
                    
                    if (!byKey.has(key)) {
                        byKey.set(key, []);
                    }
                    byKey.get(key).push(synObj);
                }
            }
        }
    }

    const index = {
        modifiers: modifiers,
        stop: stop,
        forms: forms,
        tok: tokOf,
        extras: buildLexExtras(lex, normalizeName, tokOf),
        products: products,
        syns: syns,
        byKey: byKey
    };

    indexCache.set(records, index);
    return index;
}

/**
 * Поиск продукта по имени.
 * @param {Array} records - массив записей
 * @param {string} name - имя продукта
 * @param {string|null} confirmId - id подтвержденного продукта
 * @returns {object} результат поиска
 */
export function matchProduct(records, name, confirmId = null) {
    const index = buildIndex(records);
    const words = wordsOf(name);
    
    // Пустое имя
    if (words.length === 0) {
        return {
            status: 'empty',
            entry: null,
            state: null,
            matched: null,
            candidates: [],
            matchedWords: [],
            uncovered: [],
            confirmed: false
        };
    }
    
    // Фильтруем стоп-слова
    const content = words.filter(w => !index.stop.has(w));
    
    // Если нет содержимого
    if (content.length === 0) {
        return {
            status: 'unknown',
            entry: null,
            state: null,
            matched: null,
            candidates: [],
            matchedWords: [],
            uncovered: [],
            confirmed: false
        };
    }
    
    // Определяем состояние
    const modWords = content.filter(w => index.modifiers.has(w));
    const state = modWords.length > 0 ? index.modifiers.get(modWords[0]) : null;
    
    // Ядро слов (без модификаторов)
    const coreWords = content.filter(w => !index.modifiers.has(w));
    const tokens = content.map(w => index.tok(w));
    const coreTokens = coreWords.map(w => index.tok(w));
    
    // Вспомогательная функция: получить уникальные записи
    function distinct(syns) {
        const seen = new Set();
        const result = [];
        for (const syn of syns) {
            for (const entry of syn.entries) {
                if (!seen.has(entry)) {
                    seen.add(entry);
                    result.push(entry);
                }
            }
        }
        return result;
    }
    
    // Вспомогательная функция: принять решение
    function decide(syns) {
        const d = distinct(syns);
        if (d.length === 1) {
            return {
                status: 'ok',
                entry: d[0],
                state: state,
                matched: syns[0].synonym,
                candidates: [d[0]],
                matchedWords: content.slice(),
                uncovered: [],
                confirmed: false,
                stateInName: null
            };
        } else if (d.length >= 2) {
            return {
                status: 'ambiguous',
                entry: null,
                state: state,
                matched: null,
                candidates: d,
                matchedWords: [],
                uncovered: [],
                confirmed: false
            };
        }
        // Если d.length === 0, не должно быть, но на всякий случай
        return {
            status: 'unknown',
            entry: null,
            state: state,
            matched: null,
            candidates: [],
            matchedWords: [],
            uncovered: coreWords.slice(),
            confirmed: false
        };
    }
    
    // Шаг 1: точное совпадение по всем токенам
    const fullKey = keyOf(tokens);
    const fullSyns = index.byKey.get(fullKey);
    if (fullSyns && fullSyns.length > 0) {
        return decide(fullSyns);
    }
    
    // Шаг 2: совпадение по ядру (без модификаторов)
    if (coreTokens.length > 0) {
        const coreKey = keyOf(coreTokens);
        const coreSyns = index.byKey.get(coreKey);
        if (coreSyns && coreSyns.length > 0) {
            const r = decide(coreSyns);
            r.stateInName = state; // #FR-85 v13: слово состояния отброшено при сопоставлении — оно описывает форму пробы, а не название записи
            return r;
        }
    }
    
    // Шаг 3: подмножество
    const tokenSet = new Set(tokens);
    // #FR-85 v12: синоним должен опираться хотя бы на одно слово ядра: «вареная» (состояние) не должна находить «варенье» по общей основе
    const coreSet = new Set(coreTokens);
    const sub = index.syns.filter(s => s.tokens.length > 0 && s.tokens.every(t => tokenSet.has(t)) && (coreSet.size === 0 || s.tokens.some(t => coreSet.has(t))));
    
    if (sub.length > 0) {
        const maxLen = Math.max(...sub.map(s => s.tokens.length));
        let best = sub.filter(s => s.tokens.length === maxLen);
        let d = distinct(best);
        const best0 = best; // до сужения родового слова — для проверки лишних слов у выбора (v15)
        // #FR-85 v12: при равенстве длины родовое слово («рыба», «ягода») уступает синониму с видовым словом
        if (d.length >= 2) {
            const top = Math.max(...best.map(s => specificCount(index.extras, s.tokens)));
            const narrowed = best.filter(s => specificCount(index.extras, s.tokens) === top);
            // сужение — только если видовая запись той же строки норматива, что и родовая (иначе «рыба с картошкой» ушла бы в картофель)
            const dn = distinct(narrowed);
            const dropped = best.filter(s => !narrowed.includes(s));
            const same = (g, e) => !!(g.norm && g.norm.fresh && e.norm && g.norm.fresh === e.norm.fresh) || (!(g.norm && g.norm.fresh) && !(e.norm && e.norm.fresh) && !!g.diet?.group && g.diet.group === e.diet?.group); // v13: «норматив не установлен» у обеих — та же строка при той же группе рациона
            // #FR-85 v13: у выбора («ягоды»: садовые / дикорастущие) достаточно одного варианта той же строки норматива
            if (narrowed.length < best.length && dn.every(e => dropped.every(s => s.entries.some(g => same(g, e))))) {
                best = narrowed;
                d = dn;
            }
        }
        
        if (d.length >= 2) {
            // #FR-85 v15: у выбора («вода» → из-под крана / бутилированная) лишние слова не теряются молча: блокирующее слово — «не распознан» с пометкой, иное лишнее слово — «не распознан»
            const bestToks = new Set(best0.flatMap(s => s.tokens));
            const extra = coreWords.filter((w, i) => !bestToks.has(coreTokens[i]) && !d.every(e => isNeutral(index.extras, w, e)));
            if (extra.length > 0 && new Set(best0.map(s => s.owner)).size === 1) { // одна запись-выбор; «ягода малина» (два выбора сразу) — по-прежнему вопрос
                const blocked = d.flatMap(e => findBlockers(index.extras, extra, e));
                return {
                    status: 'unknown', entry: null, state: state, matched: null, candidates: [], matchedWords: [], uncovered: coreWords.slice(), confirmed: false,
                    composite: blocked.length > 0 ? { words: blocked.map(b => b.word), kind: blocked.some(b => b.kind === 'dish') ? 'dish' : 'changes', guess: d[0].name_ru } : undefined,
                    stateInName: null
                };
            }
            return decide(best);
        }

        const entry = d[0];
        const own = sub.filter(s => s.entries.includes(entry));
        const covered = new Set(own.flatMap(s => s.tokens));
        
        // #FR-85 v12: нейтральные уточнения (лексикон, neutral) и родовое слово при виде той же строки норматива (generic) — не «непокрытые»
        const uncovered = coreWords.filter((w, i) => !covered.has(coreTokens[i]) && !isNeutral(index.extras, w, entry) && !absorbsGeneric(index.extras, w, entry, index.products));
        const matchedWords = coreWords.filter((w, i) => covered.has(coreTokens[i]));
        const matched = best[0].synonym;
        // #FR-85 v13: слово состояния, не вошедшее в синонимы записи («сушёные грибы»), — форма пробы; в синониме («молоко сухое») — часть названия
        const stateInName = modWords.length > 0 && !modWords.some(w => covered.has(index.tok(w))) ? state : null;
        // #FR-85 v13: непокрытое слово — блюдо («каша») или меняет продукт («морская» вода): подтверждение невозможно, группа — вручную
        const blocked = uncovered.length > 0 ? findBlockers(index.extras, uncovered, entry) : [];
        if (blocked.length > 0) {
            return {
                status: 'unknown', entry: null, state: state, matched: null, candidates: [], matchedWords: [], uncovered: coreWords.slice(), confirmed: false,
                composite: { words: blocked.map(b => b.word), kind: blocked.some(b => b.kind === 'dish') ? 'dish' : 'changes', guess: entry.name_ru },
                stateInName: null
            };
        }
        
        // #FR-85 v14: «покупная» речная рыба — группа рациона «рыба и морепродукты» (слово названия переводит запись в другую группу)
        const regroup = regroupFor(index.extras, coreWords, entry);
        if (uncovered.length === 0) {
            return {
                status: 'ok',
                entry: entry,
                state: state,
                matched: matched,
                candidates: [entry],
                matchedWords: matchedWords,
                uncovered: [],
                confirmed: false,
                stateInName: stateInName,
                regroup: regroup
            };
        } else if (confirmId !== null && confirmId !== undefined && confirmId !== '' && confirmId === entry.id) {
            return {
                status: 'ok',
                entry: entry,
                state: state,
                matched: matched,
                candidates: [entry],
                matchedWords: matchedWords,
                uncovered: uncovered,
                confirmed: true,
                stateInName: stateInName,
                regroup: regroup
            };
        } else {
            return {
                status: 'partial',
                entry: entry,
                state: state,
                matched: matched,
                candidates: [entry],
                matchedWords: matchedWords,
                uncovered: uncovered,
                confirmed: false,
                stateInName: stateInName
            };
        }
    }
    
    // Шаг 4: не найдено
    return {
        status: 'unknown',
        entry: null,
        state: state,
        matched: null,
        candidates: [],
        matchedWords: [],
        uncovered: coreWords.slice(),
        confirmed: false
    };
}

/**
 * Получение записи продукта по имени.
 * @param {Array} records - массив записей
 * @param {string} name - имя продукта
 * @param {string|null} confirmId - id подтвержденного продукта
 * @returns {object|null} запись продукта или null
 */
export function productEntry(records, name, confirmId = null) {
    const result = matchProduct(records, name, confirmId);
    return result.status === 'ok' ? result.entry : null;
}

/**
 * Получение нормализованного id для продукта.
 * @param {object} entry - запись продукта
 * @param {string|null} state - состояние
 * @param {string} nuclide - изотоп
 * @returns {string|null} нормализованный id или null
 */
export function normIdFor(entry, state, nuclide = 'Cs-137') {
    if (!entry) return null;
    
    const id = state === 'dried' ? entry.norm?.dried : entry.norm?.fresh;
    if (!id) return null;
    
    if (nuclide === 'Cs-137') {
        return id;
    } else if (nuclide === 'Sr-90') {
        if (id.endsWith('_cs137')) {
            return id.replace(/_cs137$/, '_sr90');
        }
        return null;
    }
    return null;
}

/**
 * Получение списка предложений для продукта.
 * @param {Array} records - массив записей
 * @returns {string[]} список предложений
 */
export function productSuggestions(records) {
    const index = buildIndex(records);
    const seen = new Set();
    const result = [];
    
    // Сначала имена продуктов и выборов
    for (const rec of index.products) {
        if (rec.name_ru) {
            const norm = normalizeName(rec.name_ru);
            if (!seen.has(norm)) {
                seen.add(norm);
                result.push(rec.name_ru);
            }
        }
    }
    
    // Имена выборов
    for (const syn of index.syns) {
        if (syn.owner.kind === 'choice' && syn.owner.name_ru) {
            const norm = normalizeName(syn.owner.name_ru);
            if (!seen.has(norm)) {
                seen.add(norm);
                result.push(syn.owner.name_ru);
            }
        }
    }
    
    // Синонимы (кроме скрытых)
    for (const rec of index.products) {
        if (Array.isArray(rec.synonyms)) {
            const hidden = new Set(rec.hidden_synonyms || []);
            for (const syn of rec.synonyms) {
                if (hidden.has(syn)) continue;
                const norm = normalizeName(syn);
                if (!seen.has(norm)) {
                    seen.add(norm);
                    // Первая буква заглавная
                    result.push(syn.charAt(0).toUpperCase() + syn.slice(1));
                }
            }
        }
    }
    
    // Синонимы выборов
    for (const syn of index.syns) {
        if (syn.owner.kind === 'choice') {
            const hidden = new Set(syn.owner.hidden_synonyms || []);
            if (!hidden.has(syn.synonym)) {
                const norm = normalizeName(syn.synonym);
                if (!seen.has(norm)) {
                    seen.add(norm);
                    result.push(syn.synonym.charAt(0).toUpperCase() + syn.synonym.slice(1));
                }
            }
        }
    }
    
    return result.sort((a, b) => a.localeCompare(b, 'ru'));
}

/**
 * Получение записи продукта по id.
 * @param {Array} records - массив записей
 * @param {string} id - id продукта
 * @returns {object|null} запись продукта или null
 */
export function entryById(records, id) {
    const index = buildIndex(records);
    return index.products.find(p => p.id === id) || null;
}

/**
 * Статусы распознавания на русском языке.
 * @type {Object}
 */
export const MATCH_STATUS_RU = {
    ok: 'распознан',
    partial: 'распознан частично',
    ambiguous: 'неоднозначно',
    unknown: 'не распознан',
    empty: 'не введён'
};
