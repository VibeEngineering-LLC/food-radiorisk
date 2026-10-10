import csv
import json
import os
import pathlib
import sys
import fitz

sys.stdout.reconfigure(encoding="utf-8")

def parse_lx(pdf_path):
    doc = fitz.open(pdf_path)
    page = doc[82]
    words = page.get_text("words")
    
    rows = {}
    for w in words:
        x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
        key = round(y0 / 3)
        if key not in rows:
            rows[key] = []
        rows[key].append((x0, text))
    
    sorted_keys = sorted(rows.keys())
    LXM = {}
    LXF = {}
    
    def parse_pairs(tokens):
        pairs = []
        i = 0
        while i < len(tokens):
            t1 = tokens[i]
            if i + 1 < len(tokens):
                t2 = tokens[i+1]
                try:
                    val = int(t1) * 1000 + int(t2)
                    pairs.append(val)
                    i += 2
                    continue
                except ValueError:
                    pass
            try:
                val = int(t1)
                pairs.append(val)
                i += 1
            except ValueError:
                i += 1
        return pairs

    for key in sorted_keys:
        row = sorted(rows[key], key=lambda x: x[0])
        texts = [t for _, t in row]
        if not texts:
            continue
        
        age = None
        data_tokens = []
        
        if texts[0] == 'более':
            age = 85
            data_tokens = texts[1:]
        else:
            try:
                age = int(texts[0])
                data_tokens = texts[1:]
            except ValueError:
                continue
        
        if age is None:
            continue
            
        if age not in [0,1,2,3,4,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85]:
            continue
            
        pairs = parse_pairs(data_tokens)
        if len(pairs) >= 2:
            LXM[age] = pairs[0]
            LXF[age] = pairs[1]
            
    doc.close()
    
    assert LXM[0] == 100000, f"LXM[0] is {LXM[0]}"
    assert LXM[20] == 98724, f"LXM[20] is {LXM[20]}"
    assert LXF[70] == 78418, f"LXF[70] is {LXF[70]}"
    
    return LXM, LXF

def parse_who(csv_path, needed_causes):
    DEATHS = {}
    rows_used = 0
    
    with open(csv_path, encoding="latin-1", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        
        idx_country = header.index("Country")
        idx_year = header.index("Year")
        idx_sex = header.index("Sex")
        idx_cause = header.index("Cause")
        
        death_cols = {}
        for i in range(1, 27):
            col_name = f"Deaths{i}"
            if col_name in header:
                death_cols[i] = header.index(col_name)
        
        for row in reader:
            if len(row) < max(death_cols.values()) + 1:
                continue
                
            country = row[idx_country].strip()
            year = row[idx_year].strip()
            sex = row[idx_sex].strip()
            cause = row[idx_cause].strip()
            
            if country != "4272" or year != "2019":
                continue
            if sex not in ("1", "2"):
                continue
            if cause not in needed_causes:
                continue
                
            vals = [0] * 19
            for i in range(1, 27):
                if i in death_cols:
                    cell = row[death_cols[i]].strip()
                    if cell:
                        try:
                            v = int(cell)
                        except ValueError:
                            v = 0
                    else:
                        v = 0
                    
                    if i == 2:
                        vals[0] = v  # до 1 года
                    elif 3 <= i <= 6:
                        vals[1] += v  # 1-4 года
                    elif 7 <= i <= 22:
                        vals[i - 5] = v  # 5-9 (Deaths7) -> группа 2 ... 80-84 (Deaths22) -> группа 17
                    elif i == 23:
                        vals[18] = v  # 85 и старше
                    # 24-26 ignored
            
            DEATHS[(cause, sex)] = vals
            rows_used += 1
            
    return DEATHS, rows_used

def main():
    D = os.environ.get("FR_LIT_RISKS_DIR") or str(pathlib.Path(__file__).resolve().parent.parent / "audit" / "_lit_risks")
    
    QUERIES = [
        ("1026", 3, 13, "both"),
        ("1096", 3, 13, "both"),
        ("1000", 3, 13, "both"),
        ("1026", 3, 13, "male"),
        ("1026", 3, 13, "female"),
        ("1098", 3, 13, "both"),
        ("1026", 20, None, "both"),
        ("1096", 20, 30, "both"),
        ("1026", 20, 70, "both"),
        ("1026", 33, 47.5, "both"),
        ("1099", 0, 85, "both"),
        ("1000", 20, None, "both"),
        ("1097", 7.25, 61.5, "male")
    ]
    
    needed_causes = set([q[0] for q in QUERIES])
    needed_causes.add("1000")
    
    LXM, LXF = parse_lx(os.path.join(D, "demogr2023.pdf"))
    DEATHS, rows_used = parse_who(os.path.join(D, "Morticd10_part5"), needed_causes)
    
    BM = 762058
    BF = 719016
    wm = BM / (BM + BF)
    
    GROUPS = [
        (0, 1),
        (1, 5),
        (5, 10),
        (10, 15),
        (15, 20),
        (20, 25),
        (25, 30),
        (30, 35),
        (35, 40),
        (40, 45),
        (45, 50),
        (50, 55),
        (55, 60),
        (60, 65),
        (65, 70),
        (70, 75),
        (75, 80),
        (80, 85),
        (85, None)
    ]
    
    def l(sex, x):
        if x is None or x == float('inf'):
            return 0.0
        if x < 0:
            raise ValueError("x must be >= 0")
        if x > 85:
            raise ValueError("x must be <= 85")
            
        LX = LXM if sex == "1" else LXF
        ages = sorted(LX.keys())
        
        if x == 0:
            return LX[0]
        if x == 85:
            return LX[85]
            
        for i in range(len(ages) - 1):
            a0 = ages[i]
            a1 = ages[i+1]
            if a0 <= x <= a1:
                if a1 == a0:
                    return LX[a0]
                t = (x - a0) / (a1 - a0)
                return LX[a0] + t * (LX[a1] - LX[a0])
                
        return LX[ages[-1]]
        
    def share(cause, sex, i):
        if (cause, sex) not in DEATHS:
            return 0.0
        if ("1000", sex) not in DEATHS:
            return 0.0
        num = DEATHS[(cause, sex)][i]
        den = DEATHS[("1000", sex)][i]
        if den == 0:
            return 0.0
        return num / den
        
    def prob(cause, a, b, who):
        num = 0.0
        den = 0.0
        
        if who == "both":
            sexes = [("1", wm), ("2", 1 - wm)]
        elif who == "male":
            sexes = [("1", 1.0)]
        elif who == "female":
            sexes = [("2", 1.0)]
        else:
            raise ValueError("Invalid who")
            
        for sex, w in sexes:
            den += w * l(sex, a)
            
            for i, (g0, g1) in enumerate(GROUPS):
                lo = max(g0, a)
                hi = min(g1 if g1 is not None else float('inf'), b if b is not None else float('inf'))
                
                if hi > lo:
                    s = share(cause, sex, i)
                    l_lo = l(sex, lo)
                    l_hi = l(sex, hi)
                    num += w * s * (l_lo - l_hi)
                    
        if den == 0:
            return 0.0
        return num / den
        
    results = []
    for cause, a, b, who in QUERIES:
        p = prob(cause, a, b, who)
        results.append({
            "code": cause,
            "a": a,
            "b": b,
            "who": who,
            "p": float(p)
        })
        
    print(json.dumps(results, ensure_ascii=False, indent=1))
    print(f"WHO rows used: {rows_used}", file=sys.stderr)

if __name__ == "__main__":
    main()
