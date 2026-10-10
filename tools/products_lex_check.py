import re


def check_lexicon_extras(ds, records, errors, normalize_name, stem_ru):
    # Поиск записи лексикона
    lex = None
    for r in records:
        if isinstance(r, dict) and r.get('kind') == 'lexicon':
            lex = r
            break
    if lex is None:
        return

    record_id = lex.get('id', '-')

    # Предварительный расчет данных
    products = {}
    diet_groups = set()
    modifier_words = set()
    single_syn = set()

    for r in records:
        if not isinstance(r, dict):
            continue
        kind = r.get('kind')
        
        if kind == 'product':
            rid = r.get('id')
            if rid is not None:
                products[rid] = r
            # Диетические группы
            diet = r.get('diet')
            if isinstance(diet, dict):
                group = diet.get('group')
                if isinstance(group, str) and group:
                    diet_groups.add(group)
            # Синонимы
            syns = r.get('synonyms', [])
            if isinstance(syns, list):
                for s in syns:
                    if isinstance(s, str):
                        ns = normalize_name(s)
                        if ns and ' ' not in ns:
                            single_syn.add(ns)

        elif kind == 'choice':
            # Синонимы для choice
            syns = r.get('synonyms', [])
            if isinstance(syns, list):
                for s in syns:
                    if isinstance(s, str):
                        ns = normalize_name(s)
                        if ns and ' ' not in ns:
                            single_syn.add(ns)

        elif kind == 'modifier':
            words = r.get('words', [])
            if isinstance(words, list):
                for w in words:
                    if isinstance(w, str):
                        modifier_words.add(normalize_name(w))

    # Стоп-слова из лексикона
    stopwords = set()
    lex_stopwords = lex.get('stopwords', [])
    if isinstance(lex_stopwords, list):
        for w in lex_stopwords:
            if isinstance(w, str):
                stopwords.add(normalize_name(w))

    # Проверка поля neutral
    neutral = lex.get('neutral', [])
    if not isinstance(neutral, list):
        errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|neutral must be a list")
    else:
        seen_neutral = {}
        for i, group in enumerate(neutral):
            prefix = f"group {i}"
            if not isinstance(group, dict):
                errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} must be a dict")
                continue

            # Проверка why
            why = group.get('why')
            if not isinstance(why, str) or len(why.strip()) < 20:
                errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} why must be a string with at least 20 characters")

            # Проверка words
            words = group.get('words')
            if not isinstance(words, list) or len(words) == 0:
                errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} words must be a non-empty list")
                continue

            # Определение scope для проверки дубликатов
            entries = group.get('entries', [])
            diet_groups_val = group.get('diet_groups', [])
            
            # Валидация entries
            if entries is not None:
                if not isinstance(entries, list):
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} entries must be a list")
                    entries = []
                else:
                    for e in entries:
                        if not isinstance(e, str) or e not in products:
                            errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} entry '{e}' not found in products")

            # Валидация diet_groups
            if diet_groups_val is not None:
                if not isinstance(diet_groups_val, list):
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} diet_groups must be a list")
                    diet_groups_val = []
                else:
                    for dg in diet_groups_val:
                        if not isinstance(dg, str) or dg not in diet_groups:
                            errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} diet group '{dg}' not found")

            # Формирование scope
            scope_entries = tuple(sorted(entries)) if isinstance(entries, list) else ()
            scope_diet = tuple(sorted(diet_groups_val)) if isinstance(diet_groups_val, list) else ()
            scope = (scope_entries, scope_diet)

            # Проверка слов
            for w in words:
                if not isinstance(w, str):
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word must be a string")
                    continue
                
                nw = normalize_name(w)
                if nw != w:
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word '{w}' is not normalized")
                if not nw:
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word must not be empty")
                    continue
                if ' ' in nw:
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word '{w}' must not contain spaces")
                    continue

                # Проверка на стоп-слова, модификаторы, одиночные синонимы
                if nw in modifier_words:
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word '{w}' is a modifier")
                if nw in stopwords:
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word '{w}' is a stopword")
                if nw in single_syn:
                    errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word '{w}' is a single-word synonym")

                # Проверка дубликатов
                if nw in seen_neutral:
                    prev_scope = seen_neutral[nw]
                    # Дубликат, если scope одинаковый или один из них пустой
                    if prev_scope == scope or prev_scope == ((), ()) or scope == ((), ()):
                        errors.append(f"{ds}|{record_id}|PROD_NEUTRAL|{prefix} word '{w}' is duplicated")
                else:
                    seen_neutral[nw] = scope

    # Проверка поля generic
    generic = lex.get('generic', [])
    if not isinstance(generic, list):
        errors.append(f"{ds}|{record_id}|PROD_GENERIC|generic must be a list")
    else:
        seen_generic = set()
        for i, item in enumerate(generic):
            prefix = f"item {i}"
            if not isinstance(item, dict):
                errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} must be a dict")
                continue

            # Проверка why
            why = item.get('why')
            if not isinstance(why, str) or len(why.strip()) < 20:
                errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} why must be a string with at least 20 characters")

            # Проверка entry
            entry = item.get('entry')
            if not isinstance(entry, str) or entry not in products:
                errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} entry '{entry}' not found in products")
                # Если entry невалиден, пропускаем проверку слов по синонимам, но проверяем формат слов
                # Однако по спецификации: "entry is a string and a key of products". 
                # Если entry не найден, мы не можем проверить стемы. 
                # Но нужно ли прерывать? "Be defensive". 
                # Если entry невалиден, ошибка уже добавлена. 
                # Проверка слов: "stem_ru(word) must equal ... synonyms of products[entry]". 
                # Если products[entry] нет, то проверка невозможна. 
                # Логично пропустить проверку стем, если entry невалиден.
                # Но сначала проверим формат слов.
                pass

            # Проверка words
            words = item.get('words')
            if not isinstance(words, list) or len(words) == 0:
                errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} words must be a non-empty list")
                continue

            # Получаем синонимы для проверки стем (если entry валиден)
            valid_entry = isinstance(entry, str) and entry in products
            syn_stems = set()
            if valid_entry:
                prod_rec = products[entry]
                syns = prod_rec.get('synonyms', [])
                if isinstance(syns, list):
                    for s in syns:
                        if isinstance(s, str):
                            ns = normalize_name(s)
                            if ns:
                                for w2 in ns.split(' '):
                                    if w2:
                                        syn_stems.add(stem_ru(w2))

            for w in words:
                if not isinstance(w, str):
                    errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} word must be a string")
                    continue

                nw = normalize_name(w)
                if nw != w:
                    errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} word '{w}' is not normalized")
                if not nw:
                    errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} word must not be empty")
                    continue
                if ' ' in nw:
                    errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} word '{w}' must not contain spaces")
                    continue

                # Проверка дубликатов
                if nw in seen_generic:
                    errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} word '{w}' is duplicated")
                else:
                    seen_generic.add(nw)

                # Проверка стем
                if valid_entry:
                    if stem_ru(w) not in syn_stems:
                        errors.append(f"{ds}|{record_id}|PROD_GENERIC|{prefix} generic word '{w}' has no matching stem in synonyms of {entry}")


def check_regroup(ds, records, errors, normalize_name):
    # #FR-85 v14: PROD_REGROUP — слова, переводящие запись в другую группу рациона («покупная» речная рыба -> рыба и морепродукты)
    lex = next((r for r in records if isinstance(r, dict) and r.get('kind') == 'lexicon'), None)
    if lex is None:
        return
    groups = {r['diet']['group'] for r in records if isinstance(r, dict) and r.get('kind') == 'product' and (r.get('diet') or {}).get('group')}
    for i, g in enumerate(lex.get('regroup', []) or []):
        p = f"{ds}|{lex.get('id', '-')}|PROD_REGROUP|group {i}"
        if not isinstance(g.get('why'), str) or len(g['why'].strip()) < 20:
            errors.append(f"{p} why must be at least 20 characters")
        for gr in list(g.get('from_groups', []) or []) + [g.get('to')]:
            if gr not in groups:
                errors.append(f"{p} diet group '{gr}' is not used by any product")
        for w in g.get('words', []) or []:
            if not isinstance(w, str) or normalize_name(w) != w or ' ' in w or not w:
                errors.append(f"{p} word '{w}' is not a normalized single word")


def check_blockers(ds, records, errors, normalize_name):
    # #FR-85 v13: PROD_BLOCKERS — блокирующие слова (блюдо / слово, меняющее продукт)
    lex = next((r for r in records if isinstance(r, dict) and r.get('kind') == 'lexicon'), None)
    if lex is None:
        return
    ids = {r.get('id') for r in records if isinstance(r, dict) and r.get('kind') == 'product'}
    for i, g in enumerate(lex.get('blockers', []) or []):
        p = f"{ds}|{lex.get('id', '-')}|PROD_BLOCKERS|group {i}"
        if not isinstance(g, dict) or g.get('kind') not in ('dish', 'changes'):
            errors.append(f"{p} kind must be dish or changes")
            continue
        if not isinstance(g.get('why'), str) or len(g['why'].strip()) < 20:
            errors.append(f"{p} why must be at least 20 characters")
        for e in g.get('entries', []) or []:
            if e not in ids:
                errors.append(f"{p} entry '{e}' not found in products")
        for w in g.get('words', []) or []:
            if not isinstance(w, str) or normalize_name(w) != w or ' ' in w or not w:
                errors.append(f"{p} word '{w}' is not a normalized single word")
