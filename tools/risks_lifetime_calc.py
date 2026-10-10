"""#FR-79: вероятность умереть от причины между возрастами a и b (Россия, 2019): таблица дожития lx Росстата + доли причин в смертях (база ВОЗ).
Входные таблицы (в git не входят, см. audit/_lit_risks/README.txt): audit/_lit_risks/demogr2023.pdf, audit/_lit_risks/Morticd10_part5.
Запуск: PYTHONIOENCODING=utf-8 python tools/risks_lifetime_calc.py  (текстовый отчёт), --json (значения для сверки с data-src/life_risks.yaml) или --export-table (lx и доли причин, #FR-81 V05; JSON в stdout)."""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import fitz
import csv
import json
import os
import re
import pathlib

# FR_LIT_RISKS_DIR - другая папка входных таблиц (например, из worktree, где таблицы не лежат)
SP = os.environ.get('FR_LIT_RISKS_DIR', str(pathlib.Path(__file__).resolve().parent.parent / 'audit' / '_lit_risks')).rstrip('/\\') + '/'
PDF = SP + 'demogr2023.pdf'
WHO = SP + 'Morticd10_part5'

# Part 1
doc = fitz.open(PDF)
page = doc[82]
text = page.get_text()
lines = [line.strip().replace('\u00a0', ' ') for line in text.split('\n')]

# Find index i of the LAST line equal to 'Females'
i = -1
for idx in range(len(lines) - 1, -1, -1):
    if lines[idx] == 'Females':
        i = idx
        break

if i == -1:
    raise ValueError("Could not find 'Females' line")

# Take all following lines until a line that starts with '1)'
segment = []
for j in range(i + 1, len(lines)):
    if lines[j].startswith('1)'):
        break
    segment.append(lines[j])

# Keep only lines fully matching regex r'\d{1,3}( \d{3})*' and convert to int
pattern = re.compile(r'^\d{1,3}( \d{3})*$')
nums = []
for line in segment:
    if pattern.match(line):
        nums.append(int(line.replace(' ', '')))

# Rows for ages [0,1,2,3,4,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80]
ages = [0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80]
LX = {(y, s): {} for y in (2019, 2022) for s in ('M', 'F')}
for k, age in enumerate(ages):
    row = nums[9 * k: 9 * k + 9]
    if len(row) < 9:
        break
    assert row[0] == age, f"Expected age {age}, got {row[0]}"
    # 2019 M, 2019 F, 2020 M, 2020 F, 2021 M, 2021 F, 2022 M, 2022 F
    LX[(2019, 'M')][age] = row[1]
    LX[(2019, 'F')][age] = row[2]
    LX[(2022, 'M')][age] = row[7]
    LX[(2022, 'F')][age] = row[8]

# Age 85: the LAST 8 numbers of nums in the same column order
if len(nums) >= 8:
    last8 = nums[-8:]
    LX[(2019, 'M')][85] = last8[0]
    LX[(2019, 'F')][85] = last8[1]
    LX[(2022, 'M')][85] = last8[6]
    LX[(2022, 'F')][85] = last8[7]

# Ensure keys exist
for y in (2019, 2022):
    for s in ('M', 'F'):
        if (y, s) not in LX:
            LX[(y, s)] = {}

# Births by sex
BIRTH = {2019: (762058, 719016), 2022: (670177, 633910)}
def w_m(y):
    m, f = BIRTH[y]
    return m / (m + f)

# Part 2
def lval(y, sex, age):
    if age == 999:
        return 0
    if sex == 'B':
        w = w_m(y)
        return w * LX[(y, 'M')][age] + (1 - w) * LX[(y, 'F')][age]
    else:
        return LX[(y, sex)][age]

def allcause(y, sex, a, b):
    la = lval(y, sex, a)
    lb = lval(y, sex, b)
    if la == 0:
        return 0
    return 1 - lb / la

# Part 3
WHO_DATA = {}
with open(WHO, 'r', encoding='latin-1', newline='') as f:
    reader = csv.reader(f)
    header = next(reader)
    for row in reader:
        if len(row) < 35:
            continue
        if row[0] == '4272' and row[3] == '2019':
            if row[6] == '1':
                sex = 'M'
            elif row[6] == '2':
                sex = 'F'
            else:
                continue
            v = [int(x) if x != '' else 0 for x in row[9:35]]
            WHO_DATA[(row[5], sex)] = v

def who_group_deaths(code, sex):
    v = WHO_DATA.get((code, sex), [0] * 26)
    groups = {}
    groups[(0, 1)] = v[1]
    groups[(1, 5)] = v[2] + v[3] + v[4] + v[5]
    for a in range(5, 85, 5):
        idx = 6 + (a - 5) // 5
        groups[(a, a + 5)] = v[idx]
    groups[(85, 999)] = v[22]
    return groups

# Part 4
def cause_prob(code, who, a, b, y=2019):
    if who == 'B':
        sexes = [('M', w_m(y)), ('F', 1 - w_m(y))]
    else:
        sexes = [(who, 1.0)]
    
    numerator = 0.0
    denominator = 0.0
    
    # Define groups
    groups = [(0, 1), (1, 5)]
    for a_g in range(5, 85, 5):
        groups.append((a_g, a_g + 5))
    groups.append((85, 999))
    
    # Filter groups
    valid_groups = []
    for g0, g1 in groups:
        if g0 >= a and (g1 <= b or (g1 == 999 and b == 999)):
            valid_groups.append((g0, g1))
    
    cause_deaths = who_group_deaths(code, who) if who in ('M', 'F') else None
    all_deaths = who_group_deaths('1000', who) if who in ('M', 'F') else None
    
    for s, wt in sexes:
        # Denominator
        denominator += wt * LX[(y, s)][a]
        
        # Numerator
        for g0, g1 in valid_groups:
            if who == 'B':
                # For 'B', we need to calculate share for each sex separately?
                # The prompt says: "For each sex s in the set... share = deaths_cause(g0,g1)/deaths_all('1000')(g0,g1)"
                # This implies we use the specific sex's WHO data for the share calculation.
                c_d = who_group_deaths(code, s).get((g0, g1), 0)
                a_d = who_group_deaths('1000', s).get((g0, g1), 0)
            else:
                c_d = cause_deaths.get((g0, g1), 0)
                a_d = all_deaths.get((g0, g1), 0)
            
            share = c_d / a_d if a_d > 0 else 0
            
            lx_g0 = LX[(y, s)][g0]
            lx_g1 = 0 if g1 == 999 else LX[(y, s)][g1]
            
            numerator += wt * share * (lx_g0 - lx_g1)
    
    if denominator == 0:
        return 0
    return numerator / denominator

# Part 4b (#FR-81 V05): экспорт таблицы дожития и долей причин для data-src/life_risks.yaml (--export-table)
EXPORT_CODES = ('1000', '1064', '1026', '1034', '1095', '1096', '1097', '1098', '1099', '1100', '1101', '1102')

def export_table(y=2019):
    nodes = sorted(LX[(y, 'M')].keys())
    lx_male = [LX[(y, 'M')][age] for age in nodes]
    lx_female = [LX[(y, 'F')][age] for age in nodes]
    births_male = BIRTH[y][0]
    births_female = BIRTH[y][1]
    
    ref_deaths_m = who_group_deaths('1000', 'M')
    ref_deaths_f = who_group_deaths('1000', 'F')
    
    groups = []
    for g0, g1 in ref_deaths_m.keys():
        if g1 == 999:
            groups.append([g0, None])
        else:
            groups.append([g0, g1])
    
    group_keys = list(ref_deaths_m.keys())
    
    deaths = {}
    share = {}
    
    for code in EXPORT_CODES:
        d_m = who_group_deaths(code, 'M')
        d_f = who_group_deaths(code, 'F')
        
        deaths[code] = {
            "male": [d_m.get(g, 0) for g in group_keys],
            "female": [d_f.get(g, 0) for g in group_keys]
        }
        
        share[code] = {
            "male": [
                (d_m.get(g, 0) / ref_deaths_m[g]) if ref_deaths_m.get(g, 0) > 0 else 0.0
                for g in group_keys
            ],
            "female": [
                (d_f.get(g, 0) / ref_deaths_f[g]) if ref_deaths_f.get(g, 0) > 0 else 0.0
                for g in group_keys
            ]
        }
        
    return {
        "year": y,
        "nodes": nodes,
        "lx": {
            "male": lx_male,
            "female": lx_female
        },
        "births": {
            "male": births_male,
            "female": births_female
        },
        "groups": groups,
        "deaths": deaths,
        "share": share
    }

def export_table_json():
    return json.dumps(export_table(), ensure_ascii=False, indent=1)

# Part 5
if __name__ == '__main__':
    if '--export-table' in sys.argv:
        print(export_table_json())
        sys.exit(0)
    if '--json' in sys.argv:  # значения для сверки с data-src/life_risks.yaml: {код ВОЗ: {"adult"|"child": {"both"|"male"|"female": доля}}}
        import json
        key = {'B': 'both', 'M': 'male', 'F': 'female'}
        out = {code: {name: {key[s]: cause_prob(code, s, a, 70, 2019) for s in 'BMF'} for name, a in (('adult', 20), ('child', 0))}
               for code in ('1000', '1064', '1026', '1034', '1095', '1096', '1101', '1100', '1102', '1097', '1099')}
        print(json.dumps(out, ensure_ascii=False, indent=1))
        sys.exit(0)
    print(f"w_male 2019: {w_m(2019):.5f}")
    print(f"w_male 2022: {w_m(2022):.5f}")
    
    print("\nAllcause probabilities:")
    for y in (2019, 2022):
        for (a, b) in ((0, 70), (20, 70), (0, 75), (20, 75), (0, 999), (20, 999)):
            p_m = allcause(y, 'M', a, b) * 100
            p_f = allcause(y, 'F', a, b) * 100
            p_b = allcause(y, 'B', a, b) * 100
            print(f"{y} {a} {b} M: {p_m:.2f}% F: {p_f:.2f}% B: {p_b:.2f}%")
    
    print("\nCause-specific probabilities (y=2019):")
    causes = [
        ('1000', 'all causes'),
        ('1026', 'neoplasms C00-D48'),
        ('1034', 'lung cancer'),
        ('1064', 'circulatory'),
        ('1067', 'IHD'),
        ('1069', 'cerebrovascular'),
        ('1072', 'respiratory'),
        ('1078', 'digestive'),
        ('1095', 'external'),
        ('1096', 'transport'),
        ('1097', 'falls'),
        ('1098', 'drowning'),
        ('1099', 'fire'),
        ('1100', 'accidental poisoning'),
        ('1101', 'suicide'),
        ('1102', 'homicide'),
        ('1103', 'other external')
    ]
    
    for code, name in causes:
        p_m_070 = cause_prob(code, 'M', 0, 70, 2019) * 100
        p_f_070 = cause_prob(code, 'F', 0, 70, 2019) * 100
        p_b_070 = cause_prob(code, 'B', 0, 70, 2019) * 100
        
        p_m_2070 = cause_prob(code, 'M', 20, 70, 2019) * 100
        p_f_2070 = cause_prob(code, 'F', 20, 70, 2019) * 100
        p_b_2070 = cause_prob(code, 'B', 20, 70, 2019) * 100
        
        p_m_0999 = cause_prob(code, 'M', 0, 999, 2019) * 100
        p_f_0999 = cause_prob(code, 'F', 0, 999, 2019) * 100
        p_b_0999 = cause_prob(code, 'B', 0, 999, 2019) * 100
        
        print(f"{code} {name}: (0,70) M:{p_m_070:.3f} F:{p_f_070:.3f} B:{p_b_070:.3f} | (20,70) M:{p_m_2070:.3f} F:{p_f_2070:.3f} B:{p_b_2070:.3f} | (0,999) M:{p_m_0999:.3f} F:{p_f_0999:.3f} B:{p_b_0999:.3f}")
    
    print("\nControl (20,70, B, y=2019):")
    ac_val = allcause(2019, 'B', 20, 70)
    cp_val = cause_prob('1000', 'B', 20, 70, 2019)
    diff = ac_val - cp_val
    print(f"Allcause: {ac_val:.6f}, CauseProb: {cp_val:.6f}, Diff: {diff:.6f}")
