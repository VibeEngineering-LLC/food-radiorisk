#FR-81 V05: сверка таблицы дожития и долей причин из data-src/life_risks.yaml с записями lr_* (11 кодов × 2 колонки × 3 группы пола) и мутационная приёмка сверки. Запуск: PYTHONIOENCODING=utf-8 python tools/risks_lifetime_table_check.py [--mutate] [путь_к_yaml]

import copy
import json
import pathlib
import sys
import yaml

sys.stdout.reconfigure(encoding="utf-8")

CODE = {
    "lr_all_causes": "1000",
    "lr_circulatory": "1064",
    "lr_neoplasms": "1026",
    "lr_lung_cancer": "1034",
    "lr_external": "1095",
    "lr_transport": "1096",
    "lr_suicide": "1101",
    "lr_poisoning": "1100",
    "lr_homicide": "1102",
    "lr_falls": "1097",
    "lr_fire": "1099",
}
TOL = 1e-6
COLS = {"adult": 20, "child": 0}
END = 70
SEX = {"both": None, "male": "male", "female": "female"}


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if isinstance(data, dict) and "records" in data:
        return data["records"]
    return data


def prob(records, code, a, b, who):
    lt = None
    sh = None
    for rec in records:
        if rec.get("kind") == "life_table":
            lt = rec
        if rec.get("kind") == "cause_shares" and rec.get("code") == code:
            sh = rec
    if lt is None or sh is None:
        raise ValueError(f"Missing life_table or cause_shares for code {code}")

    nodes = lt["nodes"]
    groups = lt["groups"]
    lx_male = dict(zip(nodes, lt["lx"]["male"]))
    lx_female = dict(zip(nodes, lt["lx"]["female"]))

    if who == "both":
        bm = lt["births"]["male"]
        bf = lt["births"]["female"]
        total_births = bm + bf
        if total_births == 0:
            wm = 0.5
        else:
            wm = bm / total_births
        sexes = [("male", wm), ("female", 1.0 - wm)]
    else:
        sexes = [(who, 1.0)]

    numerator = 0.0
    denominator = 0.0

    for s, w in sexes:
        lx_dict = lx_male if s == "male" else lx_female
        share_list = sh["share"][s]
        
        # Denominator: w * lx(a)
        if a in lx_dict:
            denominator += w * lx_dict[a]
        else:
            # If a is not in nodes, we cannot compute lx(a) directly without interpolation.
            # However, the problem states "NO interpolation" and "discrete method".
            # Usually 'a' is a node. If not, this is an error or we assume 0?
            # Given the context of life tables, 'a' (0 or 20) should be nodes.
            # If a is not a node, we cannot proceed with the discrete definition strictly.
            # Let's assume a is always a valid node in the provided data.
            raise ValueError(f"Age {a} not found in life table nodes for sex {s}")

        # Numerator: sum over groups
        for i, group in enumerate(groups):
            g0, g1 = group[0], group[1]
            
            # Check if group is within [a, b]
            # Condition: g0 >= a AND (b is None OR (g1 is not None AND g1 <= b))
            # Note: The prompt says "g1 None means infinity".
            # If b is None, we include groups where g1 is None (infinity) or g1 <= b (if b was set).
            # Wait, the prompt says: "groups with g0 >= a and (g1 is None if b is None else (g1 is not None and g1 <= b))"
            
            if g0 < a:
                continue
                
            if b is None:
                # Include if g1 is None (infinity) OR if g1 is not None?
                # The prompt logic: "g1 is None if b is None" -> This part is ambiguous.
                # Let's re-read: "groups with g0 >= a and (g1 is None if b is None else (g1 is not None and g1 <= b))"
                # This implies:
                # If b is None: we want groups where g1 is None? Or all groups?
                # "b=None means 'to the end of the table'".
                # So if b is None, we should include ALL groups where g0 >= a.
                # The condition in the prompt text: `(g1 is None if b is None else ...)`
                # This looks like a conditional expression: `condition = (g1 is None) if (b is None) else (g1 is not None and g1 <= b)`
                # If b is None, condition is `g1 is None`. This would EXCLUDE finite groups!
                # That contradicts "b=None means to the end of the table".
                # Let's look at the identity check: `prob(records, "1000", a, None, who) must equal 1.0`.
                # If we only sum groups where g1 is None, we miss the finite groups.
                # Therefore, the interpretation of the prompt's boolean logic must be:
                # We include a group if:
                # 1. g0 >= a
                # 2. AND ( (b is None) OR (g1 is not None and g1 <= b) )
                # BUT, what if g1 is None and b is not None? Then g1 <= b is false (None <= int error or false).
                # What if g1 is None and b is None? Then we include it.
                # What if g1 is not None and b is None? Then we include it.
                
                # Let's re-read carefully: "groups with g0 >= a and (g1 is None if b is None else (g1 is not None and g1 <= b))"
                # This is likely a typo in the prompt's description of the logic, or I am misinterpreting the "if/else" structure.
                # Standard life table calculation for q_x (prob of dying between x and y):
                # Sum of (l_x - l_y) for intervals fully contained in [x, y].
                # If b is None (infinity), we sum all intervals starting at >= a.
                # So, if b is None, we include ALL groups with g0 >= a.
                # If b is not None, we include groups with g0 >= a AND g1 <= b. (And g1 must not be None, obviously, since None > b).
                
                # Let's assume the standard logic:
                # Include if g0 >= a AND (b is None OR (g1 is not None and g1 <= b))
                
                if b is None:
                    # Include all groups with g0 >= a
                    pass # Condition met
                else:
                    # This branch is not taken if b is None
                    pass
            else:
                # b is not None
                if g1 is None:
                    continue # Group extends to infinity, but we have a finite bound b
                if g1 > b:
                    continue # Group extends beyond b
                # If g1 <= b, include it
            
            # Calculate contribution
            lx_g0 = lx_dict.get(g0, 0.0)
            if g1 is None:
                lx_g1 = 0.0
            else:
                lx_g1 = lx_dict.get(g1, 0.0)
            
            share_val = share_list[i] if i < len(share_list) else 0.0
            numerator += w * share_val * (lx_g0 - lx_g1)

    if denominator == 0:
        return 0.0
    return numerator / denominator


def check(records):
    n = 0
    worst = 0.0
    failed = set()

    # Build index for lr_* records
    lr_records = {}
    for rec in records:
        if "id" in rec and rec["id"] in CODE:
            lr_records[rec["id"]] = rec

    # Main checks
    for id_key, code in CODE.items():
        if id_key not in lr_records:
            continue
        rec = lr_records[id_key]
        for col, a in COLS.items():
            for key, who in SEX.items():
                # who is None for "both", "male" for "male", "female" for "female"
                # But prob() expects "both", "male", "female"
                who_str = "both" if who is None else who
                
                expected = rec[col][key]
                got = prob(records, code, a, END, who_str)
                n += 1
                diff = abs(got - expected)
                if diff > worst:
                    worst = diff
                if diff > TOL:
                    failed.add(key)

    # Identity checks: all causes to the end of life
    for a in (0, 20):
        for who in ("both", "male", "female"):
            got = prob(records, "1000", a, None, who)
            n += 1
            diff = abs(got - 1.0)
            if diff > worst:
                worst = diff
            if diff > 1e-9:
                failed.add("all_causes_end")

    return {"n": n, "worst": worst, "failed": failed}


def main():
    args = sys.argv[1:]
    mutate = False
    yaml_path = None

    for arg in args:
        if arg == "--mutate":
            mutate = True
        elif not arg.startswith("--"):
            yaml_path = arg

    if yaml_path is None:
        yaml_path = pathlib.Path(__file__).resolve().parent.parent / "data-src" / "life_risks.yaml"
    else:
        yaml_path = pathlib.Path(yaml_path)

    records = load(yaml_path)

    if not mutate:
        r = check(records)
        print(f"сверено значений: {r['n']}; наибольшее расхождение: {r['worst']:.3e}; не сошлось: {sorted(r['failed']) or 'нет'}")
        if not r["failed"] and r["n"] == 72:
            return 0
        else:
            return 1
    else:
        baseline = check(records)
        if baseline["failed"]:
            print(f"Baseline failed: {sorted(baseline['failed'])}")
            return 1

        mutations = []

        def mutate_births(records_copy):
            lt = None
            for rec in records_copy:
                if rec.get("kind") == "life_table":
                    lt = rec
                    break
            if lt:
                # Set births male = births female (both equal to original female value)
                bf = lt["births"]["female"]
                lt["births"]["male"] = bf
            return records_copy

        def mutate_remove_last_group(records_copy):
            lt = None
            for rec in records_copy:
                if rec.get("kind") == "life_table":
                    lt = rec
                    break
            if lt and "groups" in lt and len(lt["groups"]) > 0:
                lt["groups"].pop()
            
            # Remove last element from every deaths/share list of every cause_shares record
            for rec in records_copy:
                if rec.get("kind") == "cause_shares":
                    if "share" in rec:
                        for sex in rec["share"]:
                            if rec["share"][sex]:
                                rec["share"][sex].pop()
                    if "deaths" in rec:
                        for sex in rec["deaths"]:
                            if rec["deaths"][sex]:
                                rec["deaths"][sex].pop()
            return records_copy

        mutations.append(("вес мальчиков 0,5", mutate_births, {"both"}))
        mutations.append(("группа 85+ выброшена", mutate_remove_last_group, {"all_causes_end"}))

        all_passed = True
        for name, func, expected_failed in mutations:
            records_copy = copy.deepcopy(records)
            records_copy = func(records_copy)
            r = check(records_copy)
            passed = (r["failed"] == expected_failed)
            if passed:
                print(f"{name}: красит ровно {str(sorted(expected_failed))}")
            else:
                print(f"{name}: НЕ СОВПАЛО: {str(sorted(r['failed']))}")
                all_passed = False

        return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
