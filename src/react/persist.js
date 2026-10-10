import { DEFAULT_FLIGHT_PER_YEAR } from '../calc/ext_inputs.js';
import { normRegion, DEFAULT_REGION } from '../calc/region.js';

// Константы конфигурации хранилища
export const STORAGE_KEY = 'food-radiorisk:state';
export const SCHEMA_VERSION = 1;
export const MAX_NUCLIDES = 20;

// #FR-89 v29: поля вкладки «Сравнение с облучением» (ОА радона, мощность дозы в жилище, снимки и перелёты в год) — общее состояние со «Сводкой»; хранятся отдельным ключом, старое сохранённое состояние без них не ломается
export const EXT_KEY = 'food-radiorisk:ext';
// #FR-101 (D-031): v3 — радон, гамма-фон жилища, КТ и рентгенографии хранятся ТОЛЬКО если введены пользователем (NaN/null — «не введено», берётся умолчание региона); прежнее поле «дополнительных снимков грудной клетки» (xrayN, v ≤ 2) заменено полем «рентгенографий в год» — старое значение отбрасывается (иной смысл), как и сохранённые умолчания 200 Бк/м³ и 0,15 мкЗв/ч
export const EXT_DEFAULTS = { radonC: NaN, dwellU: NaN, ctN: NaN, xrayN: NaN, flightN: DEFAULT_FLIGHT_PER_YEAR };
export const EXT_VERSION = 3;
const extNum = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e6 ? v : d);
export function parseExt(text) {
  let o = null;
  try { o = JSON.parse(text); } catch (e) { return { ...EXT_DEFAULTS }; }
  if (!isPlainObject(o)) return { ...EXT_DEFAULTS };
  if (o.v !== EXT_VERSION) return { ...EXT_DEFAULTS, flightN: extNum(o.flightN, EXT_DEFAULTS.flightN) };
  return { radonC: extNum(o.radonC, NaN), dwellU: extNum(o.dwellU, NaN), ctN: extNum(o.ctN, NaN), xrayN: extNum(o.xrayN, NaN), flightN: extNum(o.flightN, EXT_DEFAULTS.flightN) };
}
export function loadExt() {
  try { return parseExt(globalThis.localStorage?.getItem(EXT_KEY)); } catch (e) { return { ...EXT_DEFAULTS }; }
}
const fin = (x) => (Number.isFinite(x) ? x : null);
export function saveExt(ext) {
  try { globalThis.localStorage?.setItem(EXT_KEY, JSON.stringify({ v: EXT_VERSION, radonC: fin(ext.radonC), dwellU: fin(ext.dwellU), ctN: fin(ext.ctN), xrayN: fin(ext.xrayN), flightN: ext.flightN })); } catch (e) { /* хранилище недоступно — состояние не сохраняется */ }
}
// #FR-101: регион данных — один на всё приложение, отдельный ключ; по умолчанию «Мир»
export const REGION_KEY = 'food-radiorisk:region';
export function loadRegion() {
  try { return normRegion(globalThis.localStorage?.getItem(REGION_KEY)); } catch (e) { return DEFAULT_REGION; }
}
export function saveRegion(region) {
  try { globalThis.localStorage?.setItem(REGION_KEY, normRegion(region)); } catch (e) { /* хранилище недоступно */ }
}

// Проверка на "чистый" объект (не null, не массив)
function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
}

// Экспорт функции сериализации данных
export function serialize(raw, tab) {
    return JSON.stringify({ v: SCHEMA_VERSION, tab, raw });
}

// Экспорт функции восстановления состояния из строки
export function restore(text, base, nuclideNames) {
    // Попытка парсинга и базовая валидация структуры
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return null;
    }

    if (!isPlainObject(parsed)) return null;
    if (parsed.v !== SCHEMA_VERSION) return null;
    if (!isPlainObject(parsed.raw)) return null;

    const stored = parsed.raw;
    // Создаем копию базового объекта для результата, чтобы не мутировать аргументы
    const resultRaw = Object.assign({}, base);

    // Обработка простых полей (кроме массивов)
    for (const key of Object.keys(base)) {
        if (key === 'nuclides' || key === 'procRecs') continue;

        const storedVal = stored[key];
        const baseVal = base[key];

        // Проверка типа данных
        if (typeof storedVal !== typeof baseVal) continue;

        // Дополнительная проверка для строк по длине
        if (typeof storedVal === 'string' && storedVal.length > 200) continue;

        resultRaw[key] = storedVal;
    }

    // #FR-83 W05 (D-023, В5): сохранение без режима рациона сделано до умолчаний — человек вводил свой рацион, а не «по умолчанию»
    // D-023 В7: масса ровно 100 г — прежняя заглушка, режим «по умолчанию» с пустой массой; иная масса введена человеком — режим «знаю»
    if (!['own', 'default', 'high'].includes(stored.dietMode)) {
        // #FR-85 v14 п. 9 (D-025): '100', '100.0', 100, 100.0 и пустая или отсутствующая масса — прежняя заглушка
        const pg = String(stored.portionG ?? '').trim().replace(',', '.');
        const stub = (pg === '' && stored.dietMode === undefined) || (pg !== '' && Number(pg) === 100); // неизвестный режим с пустой массой остаётся «знаю»
        resultRaw.dietMode = stub ? 'default' : 'own';
        if (stub) resultRaw.portionG = '';
    }

    // #FR-81 V01: коэффициент риска не выбирается — ключа riskCoeff в base нет, сохранённый выбор отбрасывается (переносятся только ключи base)

    // Обработка массива procRecs
    const storedProcRecs = stored.procRecs;
    if (Array.isArray(storedProcRecs) && storedProcRecs.length <= 50) {
        // Проверяем, что все элементы - строки
        const allStrings = storedProcRecs.every(item => typeof item === 'string');
        if (allStrings) {
            resultRaw.procRecs = [...storedProcRecs];
        }
    }

    // Обработка массива nuclides
    const storedNuclides = stored.nuclides;
    let restoredNuclides = [];

    if (Array.isArray(storedNuclides)) {
        // Берем не более MAX_NUCLIDES элементов
        const limit = Math.min(storedNuclides.length, MAX_NUCLIDES);
        
        for (let i = 0; i < limit; i++) {
            const item = storedNuclides[i];
            
            // Элемент должен быть объектом
            if (!isPlainObject(item)) continue;

            // Поле nuclide должно быть строкой и присутствовать в списке разрешенных
            if (typeof item.nuclide !== 'string' || !nuclideNames.includes(item.nuclide)) {
                continue;
            }

            // Создаем новый объект на основе шаблона из base.nuclides[0]
            const template = base.nuclides[0];
            const newItem = Object.assign({}, template);

            let validItem = true;
            for (const key of Object.keys(template)) {
                const storedVal = item[key];
                const baseVal = template[key];

                // Строгая проверка типов для каждого поля шаблона
                if (typeof storedVal !== typeof baseVal) {
                    validItem = false;
                    break;
                }

                // Для строк проверяем длину
                if (typeof storedVal === 'string' && storedVal.length > 200) {
                    validItem = false;
                    break;
                }

                newItem[key] = storedVal;
            }

            if (validItem) {
                restoredNuclides.push(newItem);
            }
        }
    }

    // Если не удалось восстановить ни один нуклид, используем базу
    if (restoredNuclides.length === 0) {
        resultRaw.nuclides = [...base.nuclides];
    } else {
        resultRaw.nuclides = restoredNuclides;
    }

    // Обработка вкладки (tab): целое число от 0 до 2, иначе 0
    let tab = parsed.tab;
    if (!Number.isInteger(tab) || tab < 0 || tab > 2) {
        tab = 0;
    }

    return { raw: resultRaw, tab };
}

// Экспорт функции загрузки из хранилища
export function loadSaved(storage, base, nuclideNames) {
    try {
        if (!storage) return null;
        const text = storage.getItem(STORAGE_KEY);
        return restore(text, base, nuclideNames);
    } catch (e) {
        return null;
    }
}

// Экспорт функции сохранения в хранилище
export function save(storage, raw, tab) {
    try {
        if (!storage) return false;
        storage.setItem(STORAGE_KEY, serialize(raw, tab));
        return true;
    } catch (e) {
        return false;
    }
}
