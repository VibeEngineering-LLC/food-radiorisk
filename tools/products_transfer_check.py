import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
import json
import yaml
import snowballstemmer

# Инициализация стеммера
stemmer = snowballstemmer.stemmer('russian')

def norm(s):
    """Нормализация строки: нижний регистр, замена ё, только буквы/цифры."""
    if not s:
        return ""
    s = s.lower().replace('ё', 'е')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())

def words(s):
    """Получение списка слов из нормализованной строки."""
    return norm(s).split()

def stems(s):
    """Получение множества стемов для слов длиной >= 3."""
    return {stemmer.stemWord(w) for w in words(s) if len(w) >= 3}

def get_repo_root():
    """Определение корня репозитория."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(script_dir)

def load_data(root):
    """Загрузка данных продуктов и таблицы переходов."""
    products_path = os.path.join(root, 'data-src', 'products.yaml')
    transfer_path = os.path.join(root, 'public', 'data', 'transfer.json')
    
    with open(products_path, 'r', encoding='utf-8') as f:
        products = yaml.safe_load(f)
    
    with open(transfer_path, 'r', encoding='utf-8') as f:
        transfer_data = json.load(f)
    
    return products, transfer_data

def is_group_record(item_ru):
    """Проверка, является ли запись групповой (накопитель, коэффициент и т.д.)."""
    n_item = norm(item_ru)
    markers = ["накапливающ", "аккумулятор", "коэффициент перехода cs 137 из почвы"]
    return any(m in n_item for m in markers)

def extract_head(item_ru):
    """Извлечение заголовка (до первой запятой или скобки)."""
    head = item_ru
    for sep in [',', '(']:
        idx = head.find(sep)
        if idx != -1:
            head = head[:idx]
    return head.strip()

def main():
    root = get_repo_root()
    products, transfer_data = load_data(root)
    
    # Индексация таблицы переходов по item_ru
    transfer_index = {}
    for rec in transfer_data.get('records', []):
        item_ru = rec.get('item_ru')
        if item_ru:
            transfer_index[item_ru] = rec

    findings = []
    generic_species_products = set()
    
    # Специальные ID для проверки generic_with_species
    special_ids = {"p_myaso", "p_ryba", "p_griby", "p_yagody"}
    
    for p in products:
        if p.get('kind') != 'product':
            continue
        
        pid = p.get('id')
        name_ru = p.get('name_ru', '')
        synonyms = p.get('synonyms', []) or []
        hidden_synonyms = p.get('hidden_synonyms', []) or []
        transfer_list = p.get('transfer', []) or []
        
        if not transfer_list:
            continue
        
        # Собираем собственные стемы продукта
        own_names = [name_ru] + synonyms + hidden_synonyms
        own_stems = set()
        for n in own_names:
            own_stems.update(stems(n))
        
        # Проверка на "generic_with_species"
        is_generic_candidate = False
        if pid in special_ids:
            is_generic_candidate = True
        elif synonyms and len(words(synonyms[0])) == 1:
            is_generic_candidate = True
        
        has_other_species_finding = False
        
        for item_ru in transfer_list:
            # Проверка на групповую запись
            if is_group_record(item_ru):
                continue
            
            # Проверка на отсутствие ключа в таблице
            if item_ru not in transfer_index:
                findings.append({
                    'product': pid,
                    'name_ru': name_ru,
                    'kind': 'missing_key',
                    'item': item_ru
                })
                continue
            
            # Проверка на "other_species"
            head = extract_head(item_ru)
            hs = stems(head)
            
            if hs and not (hs & own_stems):
                findings.append({
                    'product': pid,
                    'name_ru': name_ru,
                    'kind': 'other_species',
                    'item': item_ru
                })
                has_other_species_finding = True
            
            # Проверка на "dry_product_liquid_keys"
            # Условие: продукт сухой (в названии есть "сух" или id заканчивается на _2)
            # И ключ относится к молоку (food_group == 'milk') с mass_basis null или 'fresh'
            
            # Определяем, является ли продукт "сухим"
            is_dry_product = False
            # Проверяем наличие стема "сух" в названиях
            for n in own_names:
                if 'сух' in stems(n):
                    is_dry_product = True
                    break
            # Или id заканчивается на _2
            if pid and pid.endswith('_2'):
                is_dry_product = True
            
            if is_dry_product:
                rec = transfer_index[item_ru]
                if rec.get('food_group') == 'milk' and rec.get('mass_basis') in [None, 'fresh']:
                    findings.append({
                        'product': pid,
                        'name_ru': name_ru,
                        'kind': 'dry_product_liquid_keys',
                        'item': item_ru
                    })
        
        # Если продукт кандидат на generic_with_species и были найдены other_species
        if is_generic_candidate and has_other_species_finding:
            generic_species_products.add(pid)

    # Вывод результатов
    for f in findings:
        print(f"{f['product']} | {f['name_ru']} | {f['kind']} | {f['item']}")
    
    # Вывод сводки по generic_with_species
    if generic_species_products:
        for pid in sorted(generic_species_products):
            print(f"generic_with_species: {pid}")

    print(f"findings: {len(findings)}")
    
    # Обработка аргумента --json
    if '--json' in sys.argv:
        idx = sys.argv.index('--json')
        if idx + 1 < len(sys.argv):
            out_path = sys.argv[idx + 1]
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(findings, f, ensure_ascii=False, indent=1)

    sys.exit(0 if len(findings) == 0 else 1)

if __name__ == '__main__':
    main()
