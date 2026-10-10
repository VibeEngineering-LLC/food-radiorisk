import sys
import json
import copy
import pathlib

sys.stdout.reconfigure(encoding="utf-8")

root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "tools"))

from products_check import check_products

def load(name):
    p = root / "public" / "data" / f"{name}.json"
    with open(p, encoding="utf-8") as f:
        return json.load(f)["records"]

products = load("products")
limits_ru = load("limits_ru")
diet = load("diet")
processing = load("processing")
transfer = load("transfer")

others = {
    "limits_ru": limits_ru,
    "diet": diet,
    "processing": processing,
    "transfer": transfer
}

base = products

a = None
b = None
for i, rec in enumerate(base):
    if rec.get("kind") == "product":
        norm = rec.get("norm", {})
        if norm.get("fresh") is not None and rec.get("processing") and rec.get("transfer") and rec.get("dry_matter") is not None:
            if a is None:
                a = i
            else:
                b = i
                break
    else:
        if b is None:
            b = i

if b is None:
    for i, rec in enumerate(base):
        if rec.get("kind") == "product" and i != a:
            b = i
            break

def run(records):
    errs = []
    check_products("products", records, others, errs)
    return errs

mutations = [
    ("dup_synonym", "PROD_DUP_SYNONYM", lambda r: r[b]["synonyms"].append(r[a]["synonyms"][0])),
    ("synonym_not_normalized", "PROD_SYNONYM_FORM", lambda r: r[a]["synonyms"].append("Зюзя  Ёлка")),
    ("norm_ref", "PROD_REF_NORM", lambda r: r[a]["norm"]["fresh"].__setitem__("fresh", "t021_p4_r99_cs137") if False else r[a]["norm"].__setitem__("fresh", "t021_p4_r99_cs137")),
    ("codex_ref", "PROD_REF_CODEX", lambda r: r[a].__setitem__("codex", ["dairy"])),
    ("diet_ref", "PROD_REF_DIET", lambda r: r[a]["diet"].__setitem__("group", "potato_xx")),
    ("proc_ref", "PROD_REF_PROC", lambda r: r[a].__setitem__("processing", ["no_such_group"])),
    ("transfer_ref", "PROD_REF_TRANSFER", lambda r: r[a].__setitem__("transfer", ["нет такой записи КП"])),
    ("dry_ref", "PROD_REF_DRY", lambda r: r[a].__setitem__("dry_matter", "no_such_dry_matter_id")),
    ("missing_field", "PROD_MISSING_FIELD", lambda r: r[a].pop("dry_matter")),
    ("modifier_only_synonym", "PROD_MODIFIER_LIST", lambda r: r[a]["synonyms"].append("сушеные")),
    ("states", "PROD_STATES", lambda r: r[a].__setitem__("states", ["frozen"])),
    ("kind", "PROD_KIND", lambda r: r[a].__setitem__("kind", "thing"))
]

rows = []
killed = 0
for name, expected, mut_func in mutations:
    r = copy.deepcopy(base)
    mut_func(r)
    errs = run(r)
    codes = [e.split("|")[2] for e in errs]
    passed = codes == [expected]
    if passed:
        killed += 1
    rows.append({
        "name": name,
        "expected": expected,
        "codes": codes,
        "pass": passed
    })

clean = run(copy.deepcopy(base))
all_passed = all(row["pass"] for row in rows)
ok = all_passed and not clean

result = {
    "ok": ok,
    "clean_errors": clean,
    "killed": killed,
    "total": 12,
    "mutations": rows
}

print(json.dumps(result, ensure_ascii=False, indent=1))
sys.exit(0 if ok else 1)
