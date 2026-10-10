#!/usr/bin/env python3
"""#FR-75: органные эквивалентные дозы при поступлении с пищей из EPA FGR 13 (FGR13ING.GDB) -> data-src/organ_dose.yaml.
Правило (audit/fgr13-lh-rule-2026-10-04.md): H_T = D_L + 20*D_H, Зв/Бк; пересчётом воспроизводится e_50 файла (до 0,77 %)."""
import argparse, hashlib, json, sys
from pathlib import Path
import yaml

WANT = ['Cs-134','Cs-137','Sr-90','I-131','K-40','Ra-226','Pb-210','Po-210','U-234','U-238','Th-228','Th-232']
AGE = {'100': '3m', '365': '1y', '1825': '5y', '3650': '10y', '5475': '15y', '7300': 'adult', '9125': 'adult'}
AGES = ['3m', '1y', '5y', '10y', '15y', 'adult']

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument('--gdb', default=str(root / 'audit/_lit_dcf/pak/fgr13pak/FGR13ING.GDB'))
    ap.add_argument('--out', default=str(root / 'data-src/organ_dose.yaml'))
    a = ap.parse_args()
    
    raw = Path(a.gdb).read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    lines = raw.decode('latin-1').split('\n')
    
    # Заголовки: 31 орган, h_Rem, e_50
    names = [lines[1][24+10*i:34+10*i].strip() for i in range(33)]
    names[31] = 'h_Rem'
    names[32] = 'e_50'
    organs = names[:31]
    
    records = []
    form_counts = {}
    i = 2
    while i < len(lines):
        ln = lines[i]
        if len(ln) < 60:
            i += 1; continue
        nuclide = ln[:7].strip()
        age_str = ln[7:12].strip()
        if nuclide not in WANT or age_str not in AGE:
            i += 1; continue
        
        age_key = AGE[age_str]
        f1 = float(ln[12:20])
        nlet = int(ln[20:22])
        letter = ln[23:24]
        
        # Пропускаем строки продолжения (H)
        if nlet == 2 and letter == 'H':
            i += 1; continue
            
        lo = [float(ln[24+10*k:34+10*k]) for k in range(33)]
        l_line = i + 1  # номер L-строки (1-based) для ссылки на источник
        hi = [0.0] * 31
        
        # Если есть высокая ЛЕТ, читаем следующую строку
        if nlet == 2:
            if i + 1 < len(lines):
                hln = lines[i+1]
                if len(hln) >= 60 and hln[23:24] == 'H':
                    hi = [float(hln[24+10*k:34+10*k]) for k in range(31)]
                    i += 1 # пропускаем H строку
        
        # Расчет эквивалентных доз
        eq_doses = {}
        for k in range(31):
            val = lo[k] if nlet == 1 else lo[k] + 20.0 * hi[k]
            eq_doses[organs[k]] = val
            
        h_rem = lo[31]
        e50 = lo[32]
        
        # Индекс формы
        key = (nuclide, age_key)
        form_counts[key] = form_counts.get(key, 0)
        f_idx = form_counts[key]
        form_counts[key] += 1
        
        rec = {
            'id': f"fgr13_{nuclide.lower().replace('-', '')}_{age_key}_f{f_idx}",
            'nuclide': nuclide,
            'age': age_key,
            'route': 'ingestion',
            'f1': f1,
            'form_idx': f_idx,
            'source': 'EPA_FGR13',
            'loc': f"FGR13ING.GDB, строка {l_line}",
            'unit': 'Sv/Bq',
            'organs': eq_doses,
            'h_rem': h_rem,
            'e50': e50
        }
        records.append(rec)
        i += 1
        
    # Проверка полноты
    missing = []
    for nu in WANT:
        for ag in AGES:
            if not any(r['nuclide'] == nu and r['age'] == ag for r in records):
                missing.append(f"{nu}_{ag}")
                
    if missing:
        print(json.dumps({"ok": False, "missing": missing}))
        return 1
        
    # Запись YAML
    out_path = Path(a.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    header = f"# organ_dose.yaml — {Path(a.gdb).name}\n# sha256: {sha}\n# Правило: H_T = D_L + 20*D_H\n"
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(header)
        f.write(yaml.safe_dump(records, allow_unicode=True, sort_keys=False, default_flow_style=False, width=200))
        
    print(json.dumps({"ok": True, "records": len(records), "nuclides": WANT}, ensure_ascii=False))
    return 0

if __name__ == '__main__':
    sys.exit(main())
