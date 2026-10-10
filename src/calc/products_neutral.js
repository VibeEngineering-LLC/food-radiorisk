// src/calc/products_neutral.js

// Проверка, является ли слово числом или процентом
export function isNumberWord(w) {
  if (typeof w !== 'string') return false;
  if (w === '%') return true;
  return /^\d+%?$/.test(w);
}

// Построение дополнительных данных из лексикона
export function buildLexExtras(lex, normalizeName, tok) {
  const neutral = [];
  const generic = new Map();
  const genericTokens = new Set();
  const blockers = []; // #FR-85 v13: слова, после которых кнопка «Да, это X» не показывается
  const regroup = []; // #FR-85 v14: слова, переводящие запись в другую группу рациона («покупная» речная рыба — «рыба и морепродукты»)

  if (!lex || typeof lex !== 'object') {
    return { neutral, generic, genericTokens, blockers, regroup };
  }

  for (const g of Array.isArray(lex.regroup) ? lex.regroup : []) {
    if (!g || !Array.isArray(g.words) || !Array.isArray(g.from_groups) || typeof g.to !== 'string') continue;
    regroup.push({ words: new Set(g.words.map(w => normalizeName(w)).filter(Boolean)), from: new Set(g.from_groups), to: g.to });
  }

  // #FR-85 v13: блокирующие слова — блюдо («каша») или слово, меняющее продукт («морская» для воды)
  if (Array.isArray(lex.blockers)) {
    for (const group of lex.blockers) {
      if (!group || typeof group !== 'object' || !Array.isArray(group.words)) continue;
      const words = new Set(group.words.filter(w => typeof w === 'string').map(w => normalizeName(w)).filter(Boolean));
      const entries = new Set(Array.isArray(group.entries) ? group.entries.filter(e => typeof e === 'string') : []);
      blockers.push({ words, entries, kind: group.kind === 'dish' ? 'dish' : 'changes' });
    }
  }

  // Обработка нейтральных слов
  if (Array.isArray(lex.neutral)) {
    for (const group of lex.neutral) {
      if (!group || typeof group !== 'object' || !Array.isArray(group.words)) {
        continue;
      }

      const wordsSet = new Set();
      for (const w of group.words) {
        if (typeof w !== 'string') continue;
        const norm = normalizeName(w);
        if (norm) wordsSet.add(norm);
      }

      const entriesSet = new Set();
      if (Array.isArray(group.entries)) {
        for (const e of group.entries) {
          if (typeof e === 'string') entriesSet.add(e);
        }
      }

      const groupsSet = new Set();
      if (Array.isArray(group.diet_groups)) {
        for (const g of group.diet_groups) {
          if (typeof g === 'string') groupsSet.add(g);
        }
      }

      neutral.push({
        words: wordsSet,
        entries: entriesSet,
        groups: groupsSet
      });
    }
  }

  // Обработка общих слов
  if (Array.isArray(lex.generic)) {
    for (const item of lex.generic) {
      if (!item || typeof item !== 'object' || !Array.isArray(item.words)) {
        continue;
      }
      if (typeof item.entry !== 'string' || item.entry === '') {
        continue;
      }

      for (const w of item.words) {
        if (typeof w !== 'string') continue;
        const norm = normalizeName(w);
        if (!norm) continue;

        generic.set(norm, item.entry);
        genericTokens.add(tok(norm));
      }
    }
  }

  return { neutral, generic, genericTokens, blockers, regroup };
}

// #FR-85 v14: группа рациона, в которую слово названия переводит запись (null — группа записи не меняется)
export function regroupFor(extras, words, entry) {
  const own = entry && entry.diet && entry.diet.group;
  if (!own || !extras || !Array.isArray(extras.regroup)) return null;
  const g = extras.regroup.find(x => x.from.has(own) && words.some(w => x.words.has(w)));
  return g ? g.to : null;
}

// Проверка, является ли слово нейтральным для данной записи
export function isNeutral(extras, word, entry) {
  if (isNumberWord(word)) return true;

  if (!extras || !Array.isArray(extras.neutral)) return false;

  for (const group of extras.neutral) {
    if (!group.words.has(word)) continue;

    // Если группа не ограничена записями и группами диет, она применяется ко всем
    if (group.entries.size === 0 && group.groups.size === 0) {
      return true;
    }

    // Если запись не задана, только универсальные группы подходят
    if (!entry) continue;

    // Проверяем соответствие по id записи
    if (group.entries.has(entry.id)) {
      return true;
    }

    // Проверяем соответствие по группе диеты
    if (entry.diet && typeof entry.diet.group === 'string' && group.groups.has(entry.diet.group)) {
      return true;
    }
  }

  return false;
}

// Проверка, поглощает ли конкретная запись общее слово
export function absorbsGeneric(extras, word, entry, products) {
  if (!extras || !extras.generic.has(word)) return false;

  const genericEntryId = extras.generic.get(word);
  if (!genericEntryId) return false;

  if (!entry || !entry.id) return false;
  if (entry.id === genericEntryId) return false;

  if (!Array.isArray(products)) return false;

  const genericEntry = products.find(p => p && p.id === genericEntryId);
  if (!genericEntry) return false;

  const entryFresh = entry.norm && entry.norm.fresh;
  const genericFresh = genericEntry.norm && genericEntry.norm.fresh;

  // #FR-85 v13: «норматив РФ не установлен» у обеих записей — та же строка, если совпадает и группа рациона («фрукт яблоко»)
  if (!entryFresh && !genericFresh) {
    const g = entry.diet && entry.diet.group, gg = genericEntry.diet && genericEntry.diet.group;
    return typeof g === 'string' && g !== '' && g === gg;
  }
  if (typeof entryFresh !== 'string' || entryFresh === '') return false;
  if (typeof genericFresh !== 'string' || genericFresh === '') return false;

  return entryFresh === genericFresh;
}

// Подсчет количества специфических токенов
export function specificCount(extras, tokens) {
  if (!Array.isArray(tokens)) return 0;

  const genericTokens = extras && extras.genericTokens ? extras.genericTokens : new Set();
  let count = 0;

  for (const t of tokens) {
    if (!genericTokens.has(t)) {
      count++;
    }
  }

  return count;
}

// #FR-85 v13: непокрытые слова, которые делают подтверждение бессмысленным: блюдо (dish) или слово, меняющее продукт (changes)
export function findBlockers(extras, words, entry) {
  const out = [];
  if (!extras || !Array.isArray(extras.blockers) || !Array.isArray(words)) return out;
  for (const w of words) {
    for (const g of extras.blockers) {
      if (!g.words.has(w)) continue;
      if (g.entries.size === 0 || (entry && g.entries.has(entry.id))) { out.push({ word: w, kind: g.kind }); break; }
    }
  }
  return out;
}
