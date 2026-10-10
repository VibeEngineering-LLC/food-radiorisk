import sys
sys.stdout.reconfigure(encoding='utf-8')

import json
import os
import copy
import yaml

# Список окончаний для разных типов прилагательных
HARD_ENDINGS = ["ий", "ая", "ое", "ие", "ого", "ой", "ому", "им", "ом", "ую", "их", "ими"]
SOFT_ENDINGS = ["ий", "яя", "ее", "ие", "его", "ей", "ему", "им", "ем", "юю", "их", "ими"]
SOFT_ENDINGS_2 = ["ий", "ая", "ее", "ие", "его", "ей", "ему", "им", "ем", "ую", "их", "ими"]

def norm_word(w):
    # Приведение к нижнему регистру и замена ё на е
    return w.lower().replace('ё', 'е')

def expand_adj(lemma):
    # Расширение прилагательного в 12 форм
    lemma = norm_word(lemma)
    
    # Проверка окончаний
    if lemma.endswith('ый') or lemma.endswith('ой'):
        stem = lemma[:-2]
        ending = 'ый' if lemma.endswith('ый') else 'ой'
        suffixes = [ending, "ая", "ое", "ые", "ого", "ой", "ому", "ым", "ом", "ую", "ых", "ыми"]
        forms = [stem + s for s in suffixes]
    elif lemma.endswith('ий'):
        # Проверяем букву перед окончанием
        if len(lemma) >= 3:
            prev_char = lemma[-3]
            if prev_char in 'гкх':
                stem = lemma[:-2]
                forms = [stem + s for s in HARD_ENDINGS]
            elif prev_char in 'жчшщ':
                stem = lemma[:-2]
                forms = [stem + s for s in SOFT_ENDINGS_2]
            else:
                # Мягкое окончание (например, домашний)
                stem = lemma[:-2]
                forms = [stem + s for s in SOFT_ENDINGS]
        else:
            return [lemma]
    else:
        return [lemma]
    
    # Удаление дубликатов с сохранением порядка
    seen = set()
    result = []
    for f in forms:
        if f not in seen:
            seen.add(f)
            result.append(f)
    return result

def expand_group(g):
    # Расширение группы слов
    new_g = {k: v for k, v in g.items() if k not in ("adj", "words")}
    
    words = []
    # Добавляем расширенные прилагательные
    for adj in g.get("adj", []):
        words.extend(expand_adj(adj))
    # Добавляем обычные слова
    for w in g.get("words", []):
        words.append(norm_word(w))
    
    # Удаление дубликатов с сохранением порядка
    seen = set()
    unique_words = []
    for w in words:
        if w not in seen:
            seen.add(w)
            unique_words.append(w)
    
    new_g["words"] = unique_words
    return new_g

def find_record_by_id(records, rec_id):
    # Поиск записи по id
    for r in records:
        if r.get("id") == rec_id:
            return r
    return None

def convert_clone_op(op, records):
    # Преобразование операции clone в new
    source = find_record_by_id(records, op["from"])
    if source is None:
        print(f"Ошибка: не найдена запись с id '{op['from']}'", file=sys.stderr)
        sys.exit(1)
    
    # Список ключей для копирования
    keep_keys = ["id", "kind", "name_ru", "synonyms", "states", "modifiers_change_product", 
                 "norm", "codex", "diet", "processing", "transfer", "dry_matter", "note", "decided"]
    
    # Глубокое копирование только нужных ключей
    copy_rec = {}
    for k in keep_keys:
        if k in source:
            copy_rec[k] = copy.deepcopy(source[k])
    
    # Установка нового id
    copy_rec["id"] = op["id"]
    
    # Переопределение полей из op
    override_keys = ["name_ru", "synonyms", "states", "modifiers_change_product", 
                     "norm", "codex", "diet", "processing", "transfer", "dry_matter", "note", "decided"]
    for k in override_keys:
        if k in op:
            copy_rec[k] = op[k]
    
    # Если decided не указан, ставим None
    if "decided" not in op:
        copy_rec["decided"] = None
    
    return {"op": "new", "why": op["why"], "record": copy_rec}

def main():
    if len(sys.argv) != 3:
        print("Использование: python tools/fr85_v13_expand.py <spec.json> <out_patch.json>", file=sys.stderr)
        sys.exit(1)
    
    spec_path = sys.argv[1]
    out_path = sys.argv[2]
    
    # Чтение спецификации
    with open(spec_path, 'r', encoding='utf-8') as f:
        spec = json.load(f)
    
    # Определение корня репозитория
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    yaml_path = os.path.join(repo_root, "data-src", "products.yaml")
    
    # Чтение YAML
    with open(yaml_path, 'r', encoding='utf-8') as f:
        records = yaml.safe_load(f)
    
    if not isinstance(records, list):
        print("Ошибка: products.yaml должен содержать список записей", file=sys.stderr)
        sys.exit(1)
    
    # Поиск лексикона
    lex = None
    for r in records:
        if r.get("kind") == "lexicon":
            lex = r
            break
    
    if lex is None:
        print("Ошибка: не найдена запись с kind='lexicon'", file=sys.stderr)
        sys.exit(1)
    
    # Построение новых полей лексикона
    spec_lex = spec.get("lex", {})
    
    # forms
    new_forms = dict(lex.get("forms", {}))
    new_forms.update(spec_lex.get("forms", {}))
    
    # neutral
    new_neutral = list(lex.get("neutral", []))
    for g in spec_lex.get("neutral", []):
        expanded = expand_group(g)
        # Удаляем ключ kind, если он есть
        if "kind" in expanded:
            del expanded["kind"]
        new_neutral.append(expanded)
    
    # generic
    new_generic = list(lex.get("generic", []))
    for g in spec_lex.get("generic", []):
        new_generic.append(expand_group(g))
    
    # blockers
    new_blockers = list(lex.get("blockers", []))
    for g in spec_lex.get("blockers", []):
        new_blockers.append(expand_group(g))
    
    # Создание операции set для лексикона
    lex_op = {
        "op": "set",
        "id": lex["id"],
        "why": "#FR-85 v13: обновление лексикона",
        "fields": {
            "forms": new_forms,
            "neutral": new_neutral,
            "generic": new_generic,
            "blockers": new_blockers
        }
    }
    
    # Обработка остальных операций
    ops = [lex_op]
    clone_count = 0
    
    for op in spec.get("ops", []):
        if op.get("op") == "clone":
            ops.append(convert_clone_op(op, records))
            clone_count += 1
        else:
            ops.append(op)
    
    # Вывод результата
    result = {
        "comment": spec.get("comment", ""),
        "ops": ops
    }
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
        f.write('\n')
    
    print(f"Операций: {len(ops)}, преобразовано clone: {clone_count}")

if __name__ == "__main__":
    main()
