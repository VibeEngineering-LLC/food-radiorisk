"""#FR-83 W10: для каждой мутации набора — на скольких входах dietDefaultFor исправной и дефектной версий различаются (число и перечень). Usage: python tools/diet_mutation_diff.py [tests/fixtures/fr83_mutations.json] [--only M03,M04]"""
import sys, json, shutil, subprocess, tempfile, pathlib
sys.stdout.reconfigure(encoding='utf-8')
root = pathlib.Path(__file__).resolve().parent.parent

def run_probe(tree):
    """зонд tools/diet_probe.mjs на копии проекта → {метка: строка-результат}"""
    p = subprocess.run(['node', str(root / 'tools/diet_probe.mjs'), str(tree)], capture_output=True, text=True, encoding='utf-8')
    if p.returncode != 0:
        raise RuntimeError(p.stderr)
    return json.loads(p.stdout)

# Разбор аргументов командной строки
mutations_file = root / 'tests/fixtures/fr83_mutations.json'
only_prefixes = None
args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == '--only':
        i += 1
        if i < len(args):
            only_prefixes = [p.strip() for p in args[i].split(',') if p.strip()]
    else:
        mutations_file = root / args[i]
    i += 1

# Загрузка мутаций
with open(mutations_file, 'r', encoding='utf-8') as f:
    mutations = json.load(f)

# Фильтрация мутаций
selected = []
for m in mutations:
    if only_prefixes:
        if any(m['name'].split(':')[0].startswith(p) for p in only_prefixes):
            selected.append(m)
    else:
        if m['file'] in ['src/calc/diet.js', 'public/data/diet.json']:
            selected.append(m)

tmp_dir = tempfile.mkdtemp(prefix='dietmut_')
try:
    # Копирование исходников в временную директорию
    orig_dir = pathlib.Path(tmp_dir) / 'orig'
    shutil.copytree(root / 'src', orig_dir / 'src')
    shutil.copytree(root / 'public', orig_dir / 'public')
    
    # Запуск пробы для исходной версии
    orig_result = run_probe(orig_dir)
    total = len(orig_result)
    
    results = {}
    
    for m in selected:
        mut_dir = pathlib.Path(tmp_dir) / 'mut'
        if mut_dir.exists():
            shutil.rmtree(mut_dir)
        shutil.copytree(orig_dir, mut_dir)
        
        target_file = mut_dir / m['file']
        with open(target_file, 'r', encoding='utf-8') as f:
            text = f.read()
            
        hits = text.count(m['from'])
        if hits != 1:
            print(f"{m['name']}: ОШИБКА hits={hits}")
            continue
            
        new_text = text.replace(m['from'], m['to'], 1)
        with open(target_file, 'w', encoding='utf-8') as f:
            f.write(new_text)
            
        mut_result = run_probe(mut_dir)
        
        diff_labels = []
        for label, val in orig_result.items():
            if label in mut_result and mut_result[label] != val:
                diff_labels.append(label)
                
        n_diff = len(diff_labels)
        print(f"{m['name']}: различается на {n_diff} из {total} входов")
        if diff_labels:
            print('; '.join(diff_labels))
        else:
            print('—')
            
        mid = m['name'].split(':')[0]
        results[mid] = {
            "differs": n_diff,
            "total": total,
            "labels": diff_labels
        }
        
    print(f"JSON: {json.dumps(results, ensure_ascii=False)}")

finally:
    shutil.rmtree(tmp_dir, ignore_errors=True)
