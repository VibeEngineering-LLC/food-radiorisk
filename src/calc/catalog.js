/** @param {string|undefined} s */
export function normRu(s) {
    return String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

export const STOP_WORDS = new Set([
    'сухое', 'сухой', 'сухая', 'сушеная', 'сушеные', 'сушеный', 'свежая', 'свежие', 'свежий', 'свежее',
    'сублимированная', 'вяленая', 'лесные', 'лесная'
]);

/** @param {string} query */
export function stemOf(query) {
    const words = normRu(query).split(/[\s,.;:()_-]+/);
    for (const w of words) {
        if (w.length >= 4 && !STOP_WORDS.has(w)) {
            return w.slice(0, Math.max(4, w.length - 2));
        }
    }
    return '';
}

export const CATEGORIES = [
    { key: 'berries', ru: 'дикорастущие ягоды', stems: ['черник','брусник','голубик','клюкв','морошк','малин','землян','клубник','ежевик','смородин','рябин','калин','водяник','ягод'], limitFresh: 'berries_wild', limitDried: 'berries_wild', procRe: /ягод|berr/i },
    { key: 'mushrooms', ru: 'грибы', stems: ['гриб','грузд','масля','маслен','подберез','подосин','лисич','опен','сыроеж','волнушк','рыжик','моховик','боровик','свинушк','зеленк','шампиньон'], limitFresh: 'mushrooms_fresh', limitDried: 'mushrooms_dried', procRe: /гриб|mushroom|boletus|fung/i },
    { key: 'game', ru: 'мясо диких животных', stems: ['олен','лось','лосят','кабан','косул','заяц','зайч','дичь','медвеж','фазан'], limitFresh: 'meat_game', limitDried: 'meat_game', procRe: /мяс|meat|дич/i },
    { key: 'meat', ru: 'мясо', stems: ['мяс','говядин','свинин','баранин','телятин','курин','колбас'], limitFresh: 'meat', limitDried: 'meat', procRe: /мяс|meat/i },
    { key: 'fish', ru: 'рыба', stems: ['рыб','карас','щук','окун','лещ','судак','плотв','форел','креветк'], limitFresh: 'fish', limitDried: 'fish_dried', procRe: /рыб|fish/i },
    { key: 'milk', ru: 'молоко и молочные продукты', stems: ['молок','кефир','творог','сыр','сметан','йогурт'], limitFresh: 'milk', limitDried: 'milk_products', procRe: /молок|milk|сыр|творог|cheese|butter|dairy|казеин/i },
    { key: 'vegetables', ru: 'овощи и картофель', stems: ['картоф','картош','морков','свекл','капуст','огур','томат','помидор','редис','овощ','тыкв','кабач','чеснок'], limitFresh: 'vegetables', limitDried: 'vegetables', procRe: /овощ|картоф|морков|капуст|свекл|vegetab|potato|carrot|cabbage|лук/i },
    { key: 'cereals', ru: 'зерно, мука, крупы', stems: ['мука','круп','зерн','пшениц','ржан','овес','овсян','ячмен','греч','рисов'], limitFresh: 'cereals', limitDried: 'cereals', procRe: /зерн|мук|круп|cereal|grain|wheat|flour|rice|рис/i },
    { key: 'bread', ru: 'хлеб', stems: ['хлеб','батон'], limitFresh: 'bread', limitDried: 'bread', procRe: /хлеб|bread/i },
    { key: 'water', ru: 'питьевая вода', stems: ['вода','воды'], limitFresh: 'water', limitDried: 'water', procRe: /вод|water/i },
    { key: 'herbal', ru: 'чай, травы, лекарственное сырьё', stems: ['чай','трав','лекарств','шиповник','настой','отвар'], limitFresh: null, limitDried: null, procRe: /лекарств|medicinal|настой|отвар|чай|tea/i }
];

/** @param {string} productName */
export function categoryOf(productName) {
    const words = normRu(productName).split(/[\s,.;:()_-]+/);
    for (const cat of CATEGORIES) {
        if (words.some(w => w.length >= 3 && cat.stems.some(s => w.startsWith(s)))) return cat;
    }
    return null;
}

/** @param {object|null} category @param {'fresh'|'dried'} state */
export function limitGroupFor(category, state) {
    if (!category) return null;
    return state === 'dried' ? (category.limitDried ?? category.limitFresh) : category.limitFresh;
}

/** @param {Array} limitsRu @param {string} code @param {string} nuclide @param {'fresh'|'dried'} state */
export function limitRecordFor(limitsRu, code, nuclide, state) {
    const candidates = limitsRu.filter(r => r.food_group_code === code && r.nuclide === nuclide && isFinite(r.value) && r.value > 0);
    if (!candidates.length) return null;
    const isDried = state === 'dried';
    const preferred = candidates.find(r => isDried ? /сух/i.test(r.food_group_ru) : !/сух/i.test(r.food_group_ru));
    return preferred || candidates[0];
}

/**
 * #FR-34: коэффициент усушки (свежий → сушёный) из норматива: допустимый уровень Cs-137 для сушёного / для свежего
 * (ТР ТС 021/2011 прил. 4: ягоды 800/160 = 5, грибы 2500/500 = 5). Нет пары разных норм — null.
 * @param {Array} limitsRu @param {object|null} category
 */
export function dryingFactorFor(limitsRu, category) {
    if (!category) return null;
    const f = limitRecordFor(limitsRu, limitGroupFor(category, 'fresh'), 'Cs-137', 'fresh');
    const d = limitRecordFor(limitsRu, limitGroupFor(category, 'dried'), 'Cs-137', 'dried');
    if (!f || !d || f.id === d.id || !(d.value > f.value)) return null;
    return { value: d.value / f.value, fresh: f.value, dried: d.value, document: d.document };
}

/** @param {Array} transferRecords @param {string} productName */
export function dryMatterFor(transferRecords, productName) {
    const valid = transferRecords.filter(r => r.quantity === 'dry_matter' && (isFinite(r.am) || isFinite(r.gm)));
    const stem = stemOf(productName);
    let match = null;
    if (stem) match = valid.find(r => normRu(r.item_ru).includes(stem));
    if (!match) {
        const cat = categoryOf(productName);
        if (cat?.key === 'mushrooms') match = valid.find(r => r.item_ru.includes('грибы съедобные'));
        else if (['game', 'meat'].includes(cat?.key)) match = valid.find(r => r.item_ru.includes('мясо всех видов'));
        else if (cat?.key === 'berries') match = valid.find(r => r.item_ru.includes('плоды, значение по умолчанию'));
    }
    if (!match) return null;
    const val = isFinite(match.am) ? match.am : match.gm;
    return { value: val, min: isFinite(match.min) ? match.min : null, max: isFinite(match.max) ? match.max : null, id: match.id, source: match.source, level: match.level, item: match.item_ru };
}

/** @param {object} rec @param {object|null} category */
export function processingMatches(rec, category) {
    if (!category) return true;
    const text = `${rec.food ?? ''} ${rec.process_ru ?? ''} ${rec.food_group ?? ''}`;
    return category.procRe.test(text);
}
