"""Product dictionary (data-src/products.yaml, #FR-85): name normalization shared with src/calc/products.js and validator rules PROD_*."""

import re

# Регулярные выражения для нормализации имени
_RE_PARENS = re.compile(r"\([^)]*\)")
_RE_SEPARATORS = re.compile(r"[\s,.;:()_\-/]+")


def normalize_name(s):
    """Нормализация имени: нижний регистр, замена ё, удаление скобок и разделителей."""
    if s is None:
        return ''
    t = str(s).lower()
    t = t.replace('ё', 'е')
    t = _RE_PARENS.sub(" ", t)
    t = _RE_SEPARATORS.sub(" ", t)
    return t.strip()


def words_of(s):
    """Возвращает список слов из нормализованной строки (без пустых)."""
    norm = normalize_name(s)
    if not norm:
        return []
    return [w for w in norm.split(' ') if w]


def key_of(words):
    """Создаёт ключ из отсортированного списка слов."""
    return ' '.join(sorted(words))


def modifier_map(records):
    """Создаёт словарь: слово -> состояние для всех модификаторов."""
    m = {}
    for r in records:
        if r.get("kind") == "modifier":
            state = r.get("state")
            words = r.get("words", [])
            for w in words:
                # Нормализуем слово для ключа, как в JS
                norm_w = normalize_name(w)
                if norm_w:
                    m[norm_w] = state
    return m


def core_words(words, mods):
    """Возвращает слова, которые не являются модификаторами."""
    return [w for w in words if w not in mods]


def check_products(ds, records, others, errors):
    """
    Проверяет записи продуктов и добавляет ошибки в список errors.
    ds: имя датасета
    records: список записей продуктов
    others: словарь с другими датасетами (limits_ru, diet, processing, transfer)
    errors: список для добавления строк с ошибками
    """
    # Подготовка lookup-структур из others
    limits_ru = others.get("limits_ru", [])
    diet_records = others.get("diet", [])
    processing_records = others.get("processing", [])
    transfer_records = others.get("transfer", [])

    # Сет для быстрого поиска
    limits_ids = {r.get("id") for r in limits_ru if r.get("id")}
    limits_by_id = {r.get("id"): r for r in limits_ru if r.get("id")}
    
    # Для проверки пар Cs-137 / Sr-90
    # Группируем limits_ru по document и food_group_code
    limits_groups = {}
    for r in limits_ru:
        doc = r.get("document")
        fgc = r.get("food_group_code")
        nuclide = r.get("nuclide")
        if doc is not None and fgc is not None:
            key = (doc, fgc)
            if key not in limits_groups:
                limits_groups[key] = {"cs137": set(), "sr90": set()}
            if nuclide == "Cs-137":
                limits_groups[key]["cs137"].add(r.get("id"))
            elif nuclide == "Sr-90" and isinstance(r.get("value"), (int, float)):  # пара нужна, только если в группе есть ЧИСЛО Sr-90 (прочерк «не нормируется» — нет)
                limits_groups[key]["sr90"].add(r.get("id"))

    diet_group_codes = {r.get("code") for r in diet_records if r.get("kind") == "group"}
    processing_food_groups = {r.get("food_group") for r in processing_records if r.get("food_group") is not None}
    transfer_item_rus = {r.get("item_ru") for r in transfer_records if r.get("item_ru") is not None}
    transfer_dry_matter_ids = {r.get("id") for r in transfer_records if r.get("quantity") == "dry_matter" and r.get("id") is not None}

    # Словарь модификаторов
    mods = modifier_map(records)

    # Словарь для проверки дубликатов синонимов: key -> list of ids
    synonym_keys = {}

    # Список продуктов для проверки
    product_records = []
    modifier_records = []

    # Проверка базовых полей и разделение на продукты/модификаторы
    required_product_keys = [
        "id", "kind", "name_ru", "synonyms", "states", "modifiers_change_product",
        "norm", "codex", "diet", "processing", "transfer", "dry_matter", "note", "decided"
    ]
    required_norm_keys = ["fresh", "dried"]
    required_diet_keys = ["group", "base", "factor"]

    for r in records:
        rid = r.get("id", "?")
        kind = r.get("kind")
        
        # PROD_KIND
        if kind not in ("product", "modifier", "lexicon", "choice"):
            errors.append(f"{ds}|{rid}|PROD_KIND|kind not in (product, modifier, lexicon, choice)")
            continue
        if kind in ("lexicon", "choice"):
            continue  # #FR-85 v11: стоп-слова/особые формы и выборы — правила в products_stems.check_stems

        if kind == "modifier":
            modifier_records.append(r)
        else:
            # Проверка наличия полей для продукта
            missing = False
            for key in required_product_keys:
                if key not in r:
                    errors.append(f"{ds}|{rid}|PROD_MISSING_FIELD|missing key: {key}")
                    missing = True
            
            if not missing:
                # Проверка norm
                norm = r.get("norm")
                if not isinstance(norm, dict):
                    errors.append(f"{ds}|{rid}|PROD_MISSING_FIELD|norm is not a dict")
                    missing = True
                else:
                    for nk in required_norm_keys:
                        if nk not in norm:
                            errors.append(f"{ds}|{rid}|PROD_MISSING_FIELD|norm missing key: {nk}")
                            missing = True
                
                # Проверка diet
                diet = r.get("diet")
                if not isinstance(diet, dict):
                    errors.append(f"{ds}|{rid}|PROD_MISSING_FIELD|diet is not a dict")
                    missing = True
                else:
                    for dk in required_diet_keys:
                        if dk not in diet:
                            errors.append(f"{ds}|{rid}|PROD_MISSING_FIELD|diet missing key: {dk}")
                            missing = True
                
                if not missing:
                    product_records.append(r)

    # Проверка модификаторов
    seen_modifier_words = {}
    for r in modifier_records:
        rid = r.get("id", "?")
        state = r.get("state")
        words = r.get("words", [])
        
        # PROD_MODIFIER_LIST: state
        if state not in ("fresh", "dried", "cooked"):
            errors.append(f"{ds}|{rid}|PROD_MODIFIER_LIST|state not in (fresh, dried, cooked)")
        
        # Проверка слов
        if not isinstance(words, list):
            words = []
            
        for w in words:
            norm_w = normalize_name(w)
            # PROD_SYNONYM_FORM: word format
            if not norm_w or w != norm_w:
                errors.append(f"{ds}|{rid}|PROD_SYNONYM_FORM|word '{w}' is not normalized or empty")
            
            # PROD_MODIFIER_LIST: duplicate words
            if norm_w:
                if norm_w in seen_modifier_words:
                    errors.append(f"{ds}|{rid}|PROD_MODIFIER_LIST|duplicate modifier word: {norm_w}")
                else:
                    seen_modifier_words[norm_w] = rid

    # Проверка продуктов
    for r in product_records:
        rid = r.get("id", "?")
        
        # PROD_STATES
        states = r.get("states")
        if not isinstance(states, list) or len(states) == 0:
            errors.append(f"{ds}|{rid}|PROD_STATES|states is not a non-empty list")
        else:
            for s in states:
                if s not in ("fresh", "dried", "cooked"):
                    errors.append(f"{ds}|{rid}|PROD_STATES|state '{s}' not in (fresh, dried, cooked)")

        # PROD_SYNONYM_FORM
        synonyms = r.get("synonyms")
        if not isinstance(synonyms, list) or len(synonyms) == 0:
            errors.append(f"{ds}|{rid}|PROD_SYNONYM_FORM|synonyms is not a non-empty list")
        if isinstance(synonyms, list) and len(synonyms) > 0:
            for syn in synonyms:
                norm_syn = normalize_name(syn)
                if not norm_syn or syn != norm_syn:
                    errors.append(f"{ds}|{rid}|PROD_SYNONYM_FORM|synonym '{syn}' is not normalized or empty")
        
        # PROD_MODIFIER_LIST: synonyms with modifier words
        if isinstance(synonyms, list):
            for syn in synonyms:
                words = words_of(syn)
                if not words:
                    continue
                # Все слова являются модификаторами?
                all_mods = all(w in mods for w in words)
                if all_mods:
                    errors.append(f"{ds}|{rid}|PROD_MODIFIER_LIST|synonym '{syn}' consists only of modifier words")
                else:
                    # Содержит хотя бы один модификатор, но modifiers_change_product != True
                    has_mod = any(w in mods for w in words)
                    if has_mod and r.get("modifiers_change_product") is not True:
                        errors.append(f"{ds}|{rid}|PROD_MODIFIER_LIST|synonym '{syn}' contains modifier words but modifiers_change_product is not True")

        # PROD_REF_NORM
        norm = r.get("norm", {})
        for state in ("fresh", "dried"):
            v = norm.get(state)
            if v is None:
                continue
            if not isinstance(v, str):
                errors.append(f"{ds}|{rid}|PROD_REF_NORM|{state}: value is not a string")
                continue
            if not v.endswith("_cs137"):
                errors.append(f"{ds}|{rid}|PROD_REF_NORM|{state}: value does not end with _cs137")
                continue
            if not (v.startswith("t021_p4_") or v.startswith("t044_water_") or v.startswith("t015_grain_")):  # #FR-85 v11: зернобобовые, злаковые (кукуруза), масличные — ТР ТС 015, документ на зерно
                errors.append(f"{ds}|{rid}|PROD_REF_NORM|{state}: value does not start with valid prefix")
                continue
            if v not in limits_ids:
                errors.append(f"{ds}|{rid}|PROD_REF_NORM|{state}: id {v} not found in limits_ru")
                continue
            
            # Проверка пары Sr-90
            limit_rec = limits_by_id.get(v)
            if limit_rec:
                doc = limit_rec.get("document")
                fgc = limit_rec.get("food_group_code")
                if doc is not None and fgc is not None:
                    group = limits_groups.get((doc, fgc))
                    if group and group["sr90"]:
                        pair_id = v[:-6] + "_sr90"
                        if pair_id not in limits_ids:
                            errors.append(f"{ds}|{rid}|PROD_REF_NORM|{state}: pair {pair_id} missing")

        # PROD_REF_CODEX
        codex = r.get("codex")
        if not isinstance(codex, list) or len(codex) == 0:
            errors.append(f"{ds}|{rid}|PROD_REF_CODEX|codex is not a non-empty list")
        else:
            valid_codex = ("infant", "milk", "water", "liquid", "minor", "general")
            for c in codex:
                if c not in valid_codex:
                    errors.append(f"{ds}|{rid}|PROD_REF_CODEX|codex element '{c}' not in valid list")
                    break # Одна ошибка на поле

        # PROD_REF_DIET
        diet = r.get("diet", {})
        group = diet.get("group")
        if group is not None and group not in diet_group_codes:
            errors.append(f"{ds}|{rid}|PROD_REF_DIET|diet.group '{group}' not found in diet records")
        
        base = diet.get("base")
        if not isinstance(base, bool):
            errors.append(f"{ds}|{rid}|PROD_REF_DIET|diet.base is not a bool")
        
        factor = diet.get("factor")
        if factor is not None:
            if not isinstance(factor, (int, float)) or isinstance(factor, bool) or factor <= 0:
                errors.append(f"{ds}|{rid}|PROD_REF_DIET|diet.factor is not a number > 0")
            else:
                # Проверка factor_source
                if "factor_source" not in diet or not diet.get("factor_source"):
                    errors.append(f"{ds}|{rid}|PROD_REF_DIET|diet.factor is set but factor_source is missing or empty")

        # PROD_REF_PROC
        processing = r.get("processing")
        if not isinstance(processing, list):
            errors.append(f"{ds}|{rid}|PROD_REF_PROC|processing is not a list")
        else:
            for p in processing:
                if p not in processing_food_groups:
                    errors.append(f"{ds}|{rid}|PROD_REF_PROC|processing element '{p}' not found in processing records")
                    break # Одна ошибка на поле

        # PROD_REF_TRANSFER
        transfer = r.get("transfer")
        if not isinstance(transfer, list):
            errors.append(f"{ds}|{rid}|PROD_REF_TRANSFER|transfer is not a list")
        else:
            for t in transfer:
                if t not in transfer_item_rus:
                    errors.append(f"{ds}|{rid}|PROD_REF_TRANSFER|transfer element '{t}' not found in transfer records")
                    break # Одна ошибка на поле

        # PROD_REF_DRY
        dry_matter = r.get("dry_matter")
        if dry_matter is not None and dry_matter not in transfer_dry_matter_ids:
            errors.append(f"{ds}|{rid}|PROD_REF_DRY|dry_matter '{dry_matter}' not found in transfer records with quantity dry_matter")

        # PROD_INTERVENTION (#FR-85 v14): уровни вмешательства НРБ-99/2009 Прил. 2а — в наборе dose_coeff есть числа, а строки норматива у записи нет
        if "intervention" in r:
            uv = [d for d in others.get("dose_coeff", []) if d.get("source") == "NRB2009_App2a" and isinstance(d.get("uv_bq_per_kg"), (int, float))]
            if r["intervention"] != "nrb2009_app2a" or not uv:
                errors.append(f"{ds}|{rid}|PROD_INTERVENTION|intervention must be nrb2009_app2a and dose_coeff must hold NRB2009_App2a uv_bq_per_kg values")
            if (r.get("norm") or {}).get("fresh") or (r.get("norm") or {}).get("dried"):
                errors.append(f"{ds}|{rid}|PROD_INTERVENTION|a product with intervention levels must have no norm row (norm.fresh and norm.dried are null)")

    # PROD_DUP_SYNONYM
    # Собираем все ключи синонимов
    for r in product_records:
        rid = r.get("id", "?")
        synonyms = r.get("synonyms", [])
        if not isinstance(synonyms, list):
            continue
        for syn in synonyms:
            words = words_of(syn)
            if words:
                k = key_of(words)
                if k not in synonym_keys:
                    synonym_keys[k] = []
                synonym_keys[k].append(rid)

    for k, ids in synonym_keys.items():
        if len(ids) > 1:
            # Уникальные id в порядке появления? "in order, with repeats"
            # Если один и тот же id встречается дважды в одном списке, это значит, что синоним дублируется в одной записи?
            # Но мы проверяем дубликаты ключей. Если в одной записи два синонима дают один ключ, это дубликат.
            # Сообщение: f"{key}: " + ",".join(<ids of the records having it, in order, with repeats>)
            # "with repeats" означает, что если id встречается дважды, он пишется дважды.
            msg_ids = ",".join(ids)
            errors.append(f"{ds}|-|PROD_DUP_SYNONYM|{k}: {msg_ids}")

    # #FR-85 v11: сопоставление идёт по основам Snowball целых слов — правила уровня основ, выборы, лексикон, скрытые синонимы
    from products_stems import check_stems
    check_stems(ds, records, errors)
