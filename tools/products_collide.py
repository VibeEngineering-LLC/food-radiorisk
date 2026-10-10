import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import re
import json
import yaml
import snowballstemmer

# Путь к скрипту и корень репозитория
script_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(script_dir)

# Добавляем каталог скрипта в путь для импорта
sys.path.insert(0, script_dir)

from products_stems import stem_ru, lexicon_of
from products_check import normalize_name, words_of

# Регулярное выражение для проверки кириллицы
CYRILLIC_RE = re.compile(r'^[а-я]+$')

# Список гласных для проверки согласных
VOWELS = set("аяоиеуэюя")

def is_valid_word(w):
    """Проверяет, является ли слово валидным (кириллица, длина >= 3)."""
    if len(w) < 3:
        return False
    return bool(CYRILLIC_RE.match(w))

def get_token(w, forms):
    """Возвращает токен для слова: из словаря форм или через стеммер."""
    if w in forms:
        return forms[w]
    return stem_ru(w)

def forms_of(w):
    """Генерирует возможные формы слова на основе окончаний."""
    result = {w}
    
    # Окончание на ь
    if w.endswith("ь"):
        base = w[:-1]
        endings = ["и", "ью", "я", "ю", "ем", "е", "ей", "ям", "ями", "ях"]
        for e in endings:
            result.add(base + e)
            
    # Окончание на а
    if w.endswith("а"):
        base = w[:-1]
        endings = ["ы", "и", "е", "у", "ой", "ою", "ам", "ами", "ах", ""]
        for e in endings:
            result.add(base + e)
            
    # Окончание на я
    if w.endswith("я"):
        base = w[:-1]
        endings = ["и", "е", "ю", "ей", "ею", "ям", "ями", "ях", "ь", ""]
        for e in endings:
            result.add(base + e)
            
    # Окончание на о
    if w.endswith("о"):
        base = w[:-1]
        endings = ["а", "у", "ом", "е", "ам", "ами", "ах", ""]
        for e in endings:
            result.add(base + e)
            
    # Окончание на е
    if w.endswith("е"):
        base = w[:-1]
        endings = ["я", "ю", "ем", "ям", "ями", "ях", "й", ""]
        for e in endings:
            result.add(base + e)
            
    # Окончание на согласную
    last_char = w[-1]
    if last_char not in VOWELS and last_char not in "ьй":
        endings = ["а", "у", "ом", "е", "ы", "и", "ов", "ам", "ами", "ах", "ей", "ем"]
        for e in endings:
            result.add(w + e)
            
    # Плавные согласные (ок, ек, ец)
    if w.endswith("ок") or w.endswith("ек") or w.endswith("ец"):
        stem = w[:-2] + w[-1]
        endings = ["а", "у", "ом", "е", "и", "ов", "ам", "ами", "ах", "ы"]
        for e in endings:
            result.add(stem + e)
            
    # Прилагательные (ый, ой, ий)
    if len(w) >= 5:
        if w.endswith("ый") or w.endswith("ой"):
            stem = w[:-2]
            suffix = w[-2:]
            endings = [suffix, "ая", "ое", "ые", "ого", "ой", "ому", "ым", "ом", "ую", "ых", "ыми"]
            for e in endings:
                result.add(stem + e)
        elif w.endswith("ий"):
            stem = w[:-2]
            endings = ["ий", "ая", "ое", "ие", "его", "ой", "ому", "им", "ем", "ую", "их", "ими"]
            for e in endings:
                result.add(stem + e)
                
    return result

def load_data():
    """Загружает данные из YAML и строит таблицы."""
    path = os.path.join(root_dir, "data-src", "products.yaml")
    with open(path, "r", encoding="utf-8") as f:
        records = yaml.safe_load(f)
        
    if not records:
        return [], {}, {}, {}
        
    # Извлекаем продукты
    products = [r for r in records if r.get("kind") == "product"]
    
    # Получаем стоп-слова и формы
    stop, forms = lexicon_of(records)
    
    # Словарь категорий: id -> (fresh, group)
    categories = {}
    # Словарь имен: id -> name
    names = {}
    
    # Таблица владельцев слов: word -> set(ids)
    owners = {}
    
    for p in products:
        pid = p.get("id")
        name = p.get("name_ru", "")
        names[pid] = name
        
        norm = p.get("norm", {})
        diet = p.get("diet", {})
        fresh = norm.get("fresh")
        group = diet.get("group")
        categories[pid] = (fresh, group)
        
        # Обрабатываем синонимы
        synonyms = p.get("synonyms", [])
        if isinstance(synonyms, str):
            synonyms = [synonyms]
            
        for syn in synonyms:
            words = words_of(syn)
            for w in words:
                if w in stop:
                    continue
                if not is_valid_word(w):
                    continue
                if w not in owners:
                    owners[w] = set()
                owners[w].add(pid)
                
    # Таблица токенов: token -> {word: set(ids)}
    token_owners = {}
    for w, ids in owners.items():
        t = get_token(w, forms)
        if t not in token_owners:
            token_owners[t] = {}
        if w not in token_owners[t]:
            token_owners[t][w] = set()
        token_owners[t][w].update(ids)
        
    return products, owners, token_owners, categories, names, forms

def find_direct_collisions(owners, token_owners, categories, names):
    """Находит прямые коллизии."""
    results = []
    
    for token, word_map in token_owners.items():
        if len(word_map) < 2:
            continue
            
        words = list(word_map.keys())
        # Генерируем пары слов
        for i in range(len(words)):
            for j in range(i + 1, len(words)):
                w1 = words[i]
                w2 = words[j]
                
                ids1 = word_map[w1]
                ids2 = word_map[w2]
                
                # Ищем пару продуктов с разными категориями
                found = False
                for id1 in ids1:
                    for id2 in ids2:
                        if id1 == id2:
                            continue
                        cat1 = categories.get(id1)
                        cat2 = categories.get(id2)
                        if cat1 != cat2:
                            name1 = names.get(id1, "")
                            name2 = names.get(id2, "")
                            line = f"DIRECT\t{token}\t{w1} ({name1})\t{w2} ({name2})"
                            results.append(line)
                            found = True
                            break
                    if found:
                        break
    return results

def find_form_collisions(owners, token_owners, categories, names, forms):
    """Находит коллизии форм."""
    results = []
    seen = set()
    
    # Собираем все валидные слова
    all_words = list(owners.keys())
    
    for w in all_words:
        ids_w = owners[w]
        # Генерируем формы
        f_list = forms_of(w)
        
        for f in f_list:
            if f == w:
                continue
            if f in owners:
                continue
                
            # Получаем токен формы
            t = get_token(f, forms)
            
            # Проверяем, есть ли этот токен в словаре токенов
            if t not in token_owners:
                continue
                
            # Ищем слова, которые имеют этот токен
            for w2, ids_w2 in token_owners[t].items():
                if w2 == w:
                    continue
                    
                # Ищем пару продуктов
                for id1 in ids_w:
                    for id2 in ids_w2:
                        if id1 == id2:
                            continue
                        cat1 = categories.get(id1)
                        cat2 = categories.get(id2)
                        if cat1 != cat2:
                            name1 = names.get(id1, "")
                            name2 = names.get(id2, "")
                            line = f"FORM\t{f}\tfrom {w} ({name1})\ttoken {t} equals word {w2} ({name2})"
                            key = (f, id1, id2)
                            if key not in seen:
                                seen.add(key)
                                results.append(line)
                                
    return results

def main():
    # Загружаем данные
    products, owners, token_owners, categories, names, forms = load_data()
    
    # Находим коллизии
    direct_lines = find_direct_collisions(owners, token_owners, categories, names)
    form_lines = find_form_collisions(owners, token_owners, categories, names, forms)
    
    # Сортируем результаты
    direct_lines.sort()
    form_lines.sort()
    
    # Выводим результат
    if "--json" in sys.argv:
        output = {
            "direct": direct_lines,
            "forms": form_lines
        }
        print(json.dumps(output, ensure_ascii=False, indent=1))
    else:
        print("# Direct collisions")
        for line in direct_lines:
            print(line)
        print("# Form collisions")
        for line in form_lines:
            print(line)
        print(f"# direct: {len(direct_lines)}, forms: {len(form_lines)}")

if __name__ == "__main__":
    main()
