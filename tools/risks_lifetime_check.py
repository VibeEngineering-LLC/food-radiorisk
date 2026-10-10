"""#FR-79: независимая сверка метода (2022, оба пола): доля причины в смертях группы против метода экспозиции (число умерших / население), таблица 6.13 Росстата.
Входы: audit/_lit_risks/tab12.xlsx, audit/_lit_risks/demogr2023.pdf (через risks_lifetime_calc). Запуск: PYTHONIOENCODING=utf-8 python tools/risks_lifetime_check.py"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import risks_lifetime_calc as C
import openpyxl

# Data A: Rosstat deaths
wb = openpyxl.load_workbook(C.SP + 'tab12.xlsx', data_only=True)
ws = wb.active
data = {}
for row in ws.iter_rows(values_only=True):
    if row and isinstance(row[0], str):
        data[row[0].strip()] = row

# Define groups
groups = []
groups.append((0, 1, 'до 1 года'))
groups.append((1, 5, '1-4'))
for a in range(5, 85, 5):
    groups.append((a, a+5, f'{a}-{a+4}'))
groups.append((85, 999, '85 и более'))

# Data B: Population
P = {0:(1387940,1300801),1:(1420506,1389778),2:(1475638,1423986),3:(1599066,1478805),4:(1684606,1601935),
5:(9601505,9373269),10:(8653271,8972214),15:(7550059,7662690),20:(7140590,7291816),25:(7989785,7547556),30:(11904897,11034920),
35:(12659963,12845231),40:(11215271,11464432),45:(10236147,10281732),50:(9102881,9311007),55:(9428480,8987811),60:(10479467,10369371),
65:(8825217,8957662),70:(6588801,6901324),75:(2748138,3156124),80:(3357514,2996011),85:(1930319,2098949)}

sum_2022 = sum(v[0] for v in P.values())
sum_2023 = sum(v[1] for v in P.values())
print(f"Sum P2022: {sum_2022} {'OK' if sum_2022 == 146980061 else 'MISMATCH'}")
print(f"Sum P2023: {sum_2023} {'OK' if sum_2023 == 146447424 else 'MISMATCH'}")

# Helper to get mean population for a group (g0, g1)
def get_mean_pop(g0, g1):
    if g0 == 0 and g1 == 1:
        return (P[0][0] + P[0][1]) / 2
    elif g0 == 1 and g1 == 5:
        p22 = sum(P[i][0] for i in range(1, 5))
        p23 = sum(P[i][1] for i in range(1, 5))
        return (p22 + p23) / 2
    else:
        # g0 is the start age, e.g., 5, 10, ...
        # The population dict has keys for 5, 10, 15...
        # For group (5,10), we use P[5]
        # For group (10,15), we use P[10]
        # ...
        # For group (85,999), we use P[85]
        if g0 in P:
            return (P[g0][0] + P[g0][1]) / 2
        return 0

def calc_method1(col, a, b):
    total = 0.0
    for g0, g1, label in groups:
        if g0 >= a and (g1 <= b or (g1 == 999 and b == 999)):
            if label in data:
                row = data[label]
                if row[1] and row[col]:
                    share = row[col] / row[1]
                    l_diff = C.lval(2022, 'B', g0) - C.lval(2022, 'B', g1)
                    total += share * l_diff
    l_a = C.lval(2022, 'B', a)
    if l_a == 0: return 0
    return total / l_a

def calc_method2(col, a, b):
    total = 0.0
    for g0, g1, label in groups:
        if g0 >= a and (g1 <= b or (g1 == 999 and b == 999)):
            if label in data:
                row = data[label]
                if row[1] and row[col]:
                    mean_pop = get_mean_pop(g0, g1)
                    if mean_pop > 0:
                        m_g = row[col] / mean_pop
                        l_g0 = C.lval(2022, 'B', g0)
                        l_g1 = C.lval(2022, 'B', g1)
                        width = g1 - g0
                        if g1 == 999:
                            L = l_g0 * 7
                        else:
                            L = width * (l_g0 + l_g1) / 2
                        total += m_g * L
    l_a = C.lval(2022, 'B', a)
    if l_a == 0: return 0
    return total / l_a

horizons = [(20, 70), (0, 70), (0, 999)]
cols = [(1, 'all'), (4, 'neoplasms'), (5, 'circulatory'), (8, 'external'), (6, 'respiratory'), (7, 'digestive')]

for a, b in horizons:
    for col, name in cols:
        m1 = calc_method1(col, a, b) * 100
        m2 = calc_method2(col, a, b) * 100
        diff = m2 - m1
        line = f"Horizon ({a},{b}) {name}: M1={m1:.3f}%, M2={m2:.3f}%, Diff={diff:.3f}pp"
        if col == 1:
            ac = C.allcause(2022, 'B', a, b) * 100
            line += f", Allcause={ac:.3f}%"
        print(line)

# Reference comparison
REF = {'neoplasms':(14946,12686),'circulatory':(41738,48283),'external':(10783,2948),'respiratory':(5427,3233),'digestive':(5237,4626)}
w = C.w_m(2022)
print("\nReference Comparison (Horizon 0-999):")
for name in ['neoplasms', 'circulatory', 'external', 'respiratory', 'digestive']:
    m, f = REF[name]
    ref_val = (w * m + (1 - w) * f) / 1000
    m1_val = calc_method1(cols[[c[1] for c in cols].index(name)][0], 0, 999) * 100
    diff = m1_val - ref_val
    print(f"{name}: Ref={ref_val:.3f}%, M1={m1_val:.3f}%, Diff={diff:.3f}pp")
