// Константы конфигурации хранилища
export const STORAGE_KEY = 'food-radiorisk:state';
export const SCHEMA_VERSION = 1;
export const MAX_NUCLIDES = 20;

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
