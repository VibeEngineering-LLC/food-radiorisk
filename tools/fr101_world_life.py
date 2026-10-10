import sys, csv, yaml
sys.stdout.reconfigure(encoding="utf-8")

def main():
    if len(sys.argv) != 4:
        print("Usage: python fr101_world_life.py <draft.yaml> <wpp.csv> <out.yaml>", file=sys.stderr)
        sys.exit(1)
    
    draft_path, wpp_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    
    # Step 1: Load draft
    with open(draft_path, encoding="utf-8") as f:
        draft = yaml.safe_load(f)
    
    old_lt = None
    causes = []
    for rec in draft:
        if rec.get("kind") == "life_table":
            old_lt = rec
        elif rec.get("kind") == "cause_shares":
            causes.append(rec)
    
    if old_lt is None:
        print("Error: No life_table record found in draft", file=sys.stderr)
        sys.exit(1)
    
    # Step 2: Read CSV
    with open(wpp_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    world_2019 = [r for r in rows if r.get("Location") == "World" and r.get("Time") == "2019"]
    
    male_rows = [r for r in world_2019 if r.get("Sex") == "Male"]
    female_rows = [r for r in world_2019 if r.get("Sex") == "Female"]
    
    male_rows.sort(key=lambda r: int(r["AgeGrpStart"]))
    female_rows.sort(key=lambda r: int(r["AgeGrpStart"]))
    
    male_nodes = [int(r["AgeGrpStart"]) for r in male_rows]
    female_nodes = [int(r["AgeGrpStart"]) for r in female_rows]
    
    if len(male_nodes) != 22 or len(female_nodes) != 22:
        print("Error: Expected 22 age groups for each sex", file=sys.stderr)
        sys.exit(1)
        
    if male_nodes != female_nodes:
        print("Error: Age group starts differ between sexes", file=sys.stderr)
        sys.exit(1)
        
    nodes = male_nodes
    
    lx_male = [round(float(r["lx"])) for r in male_rows]
    lx_female = [round(float(r["lx"])) for r in female_rows]
    
    ex_open_male = float(male_rows[-1]["ex"])
    ex_open_female = float(female_rows[-1]["ex"])
    
    def calc_e0(lx, nodes, ex_open):
        # Trapezoid integral of lx over nodes
        integral = 0.0
        for i in range(len(nodes) - 1):
            x0, x1 = nodes[i], nodes[i+1]
            y0, y1 = lx[i], lx[i+1]
            integral += (x1 - x0) * (y0 + y1) / 2.0
        # Add open interval contribution
        integral += lx[-1] * ex_open
        return integral / lx[0]
    
    e0_male = calc_e0(lx_male, nodes, ex_open_male)
    e0_female = calc_e0(lx_female, nodes, ex_open_female)
    
    births = old_lt["births"]
    b_male = births["male"]
    b_female = births["female"]
    w = b_male / (b_male + b_female)
    e0_both = w * e0_male + (1 - w) * e0_female
    
    print(f"e0 male: {e0_male:.3f}")
    print(f"e0 female: {e0_female:.3f}")
    print(f"e0 both: {e0_both:.3f}")
    
    # Step 3: Build groups
    groups = [[nodes[i], nodes[i+1]] for i in range(len(nodes)-1)] + [[nodes[-1], None]]
    
    # Step 4: Coarse index function
    def coarse_index(s):
        if s < 5: return 0
        if s < 15: return 1
        if s < 30: return 2
        if s < 50: return 3
        if s < 60: return 4
        if s < 70: return 5
        return 6
    
    # Step 5: Build life table record
    lt = {
        "id": "lt_world_2019",
        "kind": "life_table",
        "region": "world",
        "label_ru": "Таблица дожития lx, мир, 2019 (ООН WPP 2024; мужчины и женщины раздельно)",
        "year": 2019,
        "source": "UN_WPP2024",
        "loc": "ООН, World Population Prospects 2024, Abridged life table, World, 2019 (population.un.org/wpp); выборка audit/_lit_risks/wpp2024_lt_world_ru_2019.csv, столбцы AgeGrpStart и lx (Male, Female), 22 возрастных узла 0, 1, 5, …, 100",
        "quote": "WPP 2024, World 2019, ex при возрасте 0: оба пола 72,61, мужчины 70,06, женщины 75,24 года; радикс lx = 100 000",
        "method": "lx округлены до целых; между узлами l(x) — линейная интерполяция (допущение), за узлом 100 — l = 0; продолжительность жизни в открытой группе 100+ (ex_open) взята из WPP и нужна только для проверки e0; число родившихся — не из WPP, а население 0–4 лет по ВОЗ GHE 2023 (вес полов, прокси)",
        "nodes": nodes,
        "lx": {
            "male": lx_male,
            "female": lx_female
        },
        "births": births,
        "groups": groups,
        "ex_open": {
            "male": ex_open_male,
            "female": ex_open_female
        },
        "note": "births — прокси (население 0–4 лет, ВОЗ GHE 2023, лист Global 2019), нужен только как вес полов; таблицу ВОЗ из прежней заготовки (8 укрупнённых групп, e0 75,15) не используют",
        "level": "✅"
    }
    
    # Step 6: Process causes
    new_causes = []
    for c in causes:
        new_c = {}
        for k, v in c.items():
            if k == "kind":
                new_c[k] = v
                new_c["region"] = "world"
            elif k == "share":
                new_share = {}
                for sex in ("male", "female"):
                    old_shares = v[sex]
                    new_shares = [old_shares[coarse_index(groups[i][0])] for i in range(len(groups))]
                    new_share[sex] = new_shares
                new_c[k] = new_share
            elif k == "method":
                new_c[k] = "доля причины в 7 укрупнённых возрастных группах ВОЗ GHE 2023 (0–4, 5–14, 15–29, 30–49, 50–59, 60–69, 70+; смерти причины / смерти всех причин того же пола и группы) распределена по 5-летним группам таблицы дожития равномерно внутри укрупнённой группы (доля группы = доля её укрупнённой группы); вероятность — Σ доля × убыль lx (см. src/calc/life_table.js); смерти ВОЗ — модельные оценки, округлены до целых; поле deaths — по 7 укрупнённым группам"
            else:
                new_c[k] = v
        new_causes.append(new_c)
    
    # Step 7: Output
    header = [
        "# #FR-101: мир, 2019 — таблица дожития ООН WPP 2024 и доли причин ВОЗ GHE 2023 (режим «Мир», D-031)",
        "# Сформировано tools/fr101_world_life.py из audit/fr101-world-life-2019.yaml и audit/_lit_risks/wpp2024_lt_world_ru_2019.csv; руками не править",
        "# Доли причин по 5-летним группам — равномерно внутри укрупнённой группы ВОЗ (метод — в поле method каждой записи)"
    ]
    
    data = [lt] + new_causes
    yaml_str = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100000, default_flow_style=False)
    
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        for line in header:
            f.write(line + "\n")
        f.write(yaml_str)
    
    # Step 8: Print count
    print(f"Written {len(data)} records")

if __name__ == "__main__":
    main()
