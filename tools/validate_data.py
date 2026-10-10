"""Validate built JSON data files of a radiation-dose calculator."""
import sys, json, hashlib, argparse
from pathlib import Path
from collections import defaultdict
import jsonschema
sys.path.insert(0, str(Path(__file__).resolve().parent))
import datasrc  # тот же расчёт sha частей, что в build_data.py
from products_check import check_products  # #FR-85: словарь продуктов, правила PROD_*

sys.stdout.reconfigure(encoding="utf-8")

def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def check_index(data_dir, errors):
    idx_path = data_dir / "index.json"
    if not idx_path.exists():
        errors.append("-|-|INDEX|index.json missing")
        return []
    try:
        with open(idx_path, "r", encoding="utf-8") as f:
            index = json.load(f)
    except Exception as e:
        errors.append(f"-|-|INDEX|{e}")
        return []
    datasets = []
    for e in index.get("datasets", []):
        path = data_dir / e["file"]
        if not path.exists():
            errors.append(f"{e['dataset']}|-|INDEX|file missing")
            continue
        h = hashlib.sha256(path.read_bytes()).hexdigest()
        if h != e.get("json_sha256"):
            errors.append(f"{e['dataset']}|-|INDEX_SHA|hash mismatch")
        try:
            doc = json.loads(path.read_bytes().decode("utf-8"))
            datasets.append((e, doc))
        except Exception as ex:
            errors.append(f"{e['dataset']}|-|INDEX|json load failed: {ex}")
    return datasets

def check_envelope(e, doc, src_dir, errors):
    ds = doc.get("dataset")
    req = ["dataset", "schema_version", "source_file", "source_sha256", "record_count", "records"]
    if not all(k in doc for k in req):
        errors.append(f"{ds or '?'}|-|ENVELOPE|missing keys")
        return False
    if ds != e["dataset"]:
        errors.append(f"{ds}|-|ENVELOPE|dataset name mismatch")
    if doc["record_count"] != len(doc["records"]):
        errors.append(f"{ds}|-|ENVELOPE|record count mismatch")
    src = src_dir / f"{ds}.yaml"
    if not src.exists():
        errors.append(f"{ds}|-|STALE|source yaml missing")
    else:
        h = datasrc.combined_sha(datasrc.parts(src_dir, ds), src_dir)
        if h != doc.get("source_sha256"):
            errors.append(f"{ds}|-|STALE|data-src changed after build; run tools/build_data.py")
    return True

def load_validator(ds, schema_path, errors):
    # один раз на набор; нет схемы или она битая — громкий отказ, не тихий пропуск
    if not schema_path.exists():
        errors.append(f"{ds}|-|NO_SCHEMA|schema missing: {schema_path.name}")
        return None
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        jsonschema.Draft202012Validator.check_schema(schema)
        return jsonschema.Draft202012Validator(schema)
    except Exception as ex:
        errors.append(f"{ds}|-|NO_SCHEMA|schema load error: {ex}")
        return None

def check_schema(ds, rec, validator, errors):
    rid = rec.get("id", "?")
    for err in sorted(validator.iter_errors(rec), key=lambda x: str(x.path)):
        p = '/'.join(str(x) for x in err.path) or '<record>'
        errors.append(f"{ds}|{rid}|SCHEMA|{p}: {err.message}")

def check_nonfinite(ds, rec, errors):
    def walk(v):
        if isinstance(v, float) and (v != v or abs(v) == float('inf')):
            errors.append(f"{ds}|{rec.get('id', '?')}|NONFINITE|non-finite value")
        elif isinstance(v, dict):
            for val in v.values(): walk(val)
        elif isinstance(v, list):
            for item in v: walk(item)
    walk(rec)

def check_order(ds, rec, errors):
    if rec.get("source_anomaly"): return
    triples = [("value_min","value_best","value_max"), ("pe_min","pe_best","pe_max"),
               ("min","gm","max"), ("min","am","max")]
    # пара min/max входит в две тройки — один дефект записи = одна ошибка ORDER со списком нарушенных троек
    bad = []
    for t in triples:
        vals = [num(rec.get(k)) for k in t]
        vals = [v for v in vals if v is not None]
        if vals != sorted(vals):
            bad.append(f"{t} not sorted: {vals}")
    if bad:
        errors.append(f"{ds}|{rec.get('id', '?')}|ORDER|{'; '.join(bad)}")

def check_dose_range(ds, rec, errors):
    v = num(rec.get("value"))
    if v is not None and not (1e-12 <= v <= 1e-4):
        errors.append(f"{ds}|{rec.get('id', '?')}|DOSE_RANGE|value out of range")
    f1 = num(rec.get("f1"))
    if f1 is not None and not (0 < f1 <= 1):
        errors.append(f"{ds}|{rec.get('id', '?')}|DOSE_RANGE|f1 out of range")

def check_proc_range(ds, rec, errors):
    q = rec.get("quantity")
    for k in ["value_best", "value_min", "value_max"]:
        v = num(rec.get(k))
        if v is None: continue
        if q == "Fr" and not (0 <= v <= 1):
            errors.append(f"{ds}|{rec.get('id', '?')}|PROC_RANGE|{k} out of range for Fr")
        elif q in ("Pf", "Pe") and not (v > 0):
            errors.append(f"{ds}|{rec.get('id', '?')}|PROC_RANGE|{k} must be > 0")
        elif q == "reduction_factor" and not (v >= 1):
            errors.append(f"{ds}|{rec.get('id', '?')}|PROC_RANGE|{k} must be >= 1")
    # #FR-81 V4-4: «рекомендованное» не может быть единственной границей — value_best == value_min при пустом value_max значит, что нижнюю границу (до N %) выдали за рекомендованное значение
    if q == "Fr" and num(rec.get("value_best")) is not None and num(rec.get("value_best")) == num(rec.get("value_min")) and num(rec.get("value_max")) is None:
        errors.append(f"{ds}|{rec.get('id', '?')}|PROC_BEST_IS_BOUND|value_best equals value_min with no value_max: a bound given as the recommended value")
    for k in ["pe_best", "pe_min", "pe_max"]:
        v = num(rec.get(k))
        if v is not None and not (v > 0):
            errors.append(f"{ds}|{rec.get('id', '?')}|PROC_RANGE|{k} must be > 0")

def check_transfer_range(ds, rec, errors):
    for k in ["gm", "am", "sd", "max"]:
        v = num(rec.get(k))
        if v is not None and not (v > 0):
            errors.append(f"{ds}|{rec.get('id', '?')}|TRANSFER_RANGE|{k} must be > 0")
    # min = 0 законен (нижняя граница входного параметра RESRAD, «ниже предела обнаружения»); отрицательный — нет
    v = num(rec.get("min"))
    if v is not None and not (v >= 0):
        errors.append(f"{ds}|{rec.get('id', '?')}|TRANSFER_RANGE|min must be >= 0")
    gsd = num(rec.get("gsd"))
    if gsd is not None and not (gsd >= 1):
        errors.append(f"{ds}|{rec.get('id', '?')}|TRANSFER_RANGE|gsd must be >= 1")
    if rec.get("quantity") == "dry_matter":
        for k in ["am", "min", "max"]:
            v = num(rec.get(k))
            if v is not None and not (v <= 100):
                errors.append(f"{ds}|{rec.get('id', '?')}|TRANSFER_RANGE|{k} must be <= 100")

def check_limit_range(ds, rec, errors):
    v = num(rec.get("value"))
    if v is not None and not (v > 0):
        errors.append(f"{ds}|{rec.get('id', '?')}|LIMIT_RANGE|value must be > 0")

def check_life_risks_range(ds, rec, errors):
    # #FR-79: вероятности — доли в (0, 1); «оба пола» — взвешенное среднее, лежит между мужчинами и женщинами
    for col in ("adult", "child"):
        p = rec.get(col)
        if not isinstance(p, dict): continue
        vals = [num(p.get(k)) for k in ("both", "male", "female")]
        if any(v is None or not (0 < v < 1) for v in vals):
            errors.append(f"{ds}|{rec.get('id', '?')}|LIFE_RANGE|{col}: probability must be a fraction in (0, 1)")
        elif not (min(vals[1], vals[2]) <= vals[0] <= max(vals[1], vals[2])):
            errors.append(f"{ds}|{rec.get('id', '?')}|LIFE_RANGE|{col}: both-sexes value outside male/female range")

# #FR-81 V05: таблица дожития и доли причин — целостность набора (длины, монотонность lx, доли = умершие / умершие от всех причин)
def check_life_table_set(ds, records, errors):
    def err(id, rule, msg):
        errors.append(f"{ds}|{id}|{rule}|{msg}")

    life_tables = []
    cause_shares = []
    for rec in records:
        if not isinstance(rec, dict):
            continue
        kind = rec.get("kind")
        if kind == "life_table":
            life_tables.append(rec)
        elif kind == "cause_shares":
            cause_shares.append(rec)

    if len(life_tables) != 1:
        err("-", "LIFE_TABLE", f"expected exactly one life_table record, got {len(life_tables)}")
        return

    lt = life_tables[0]
    if not isinstance(lt, dict):
        err("-", "LIFE_TABLE", "malformed: life_table record is not a dict")
        return

    nodes = lt.get("nodes")
    lx = lt.get("lx")
    births = lt.get("births")
    groups = lt.get("groups")

    if not isinstance(nodes, list) or not all(isinstance(n, int) and not isinstance(n, bool) for n in nodes):
        err("-", "LIFE_TABLE", "malformed: nodes")
        return
    if not isinstance(lx, dict) or not isinstance(lx.get("male"), list) or not isinstance(lx.get("female"), list):
        err("-", "LIFE_TABLE", "malformed: lx")
        return
    if not isinstance(births, dict) or not isinstance(births.get("male"), (int, float)) or not isinstance(births.get("female"), (int, float)):
        err("-", "LIFE_TABLE", "malformed: births")
        return
    if not isinstance(groups, list):
        err("-", "LIFE_TABLE", "malformed: groups")
        return

    if nodes[0] != 0:
        err("-", "LIFE_TABLE", "nodes[0] must be 0")
    for i in range(1, len(nodes)):
        if nodes[i] <= nodes[i - 1]:
            err("-", "LIFE_TABLE", f"nodes not strictly increasing at index {i}")
            break

    for sex in ("male", "female"):
        lx_sex = lx[sex]
        if len(lx_sex) != len(nodes):
            err("-", "LIFE_TABLE", f"lx[{sex}] length mismatch with nodes")
            continue
        if lx_sex[0] != 100000:
            err("-", "LIFE_TABLE", f"lx[{sex}][0] must be 100000")
        for i in range(1, len(lx_sex)):
            if lx_sex[i] > lx_sex[i - 1]:
                err("-", "LIFE_TABLE", f"lx[{sex}] not non-increasing at index {i}")
                break
        if lx_sex[-1] <= 0:
            err("-", "LIFE_TABLE", f"lx[{sex}] last value must be > 0")

    if len(groups) == 0:
        err("-", "LIFE_TABLE", "groups must not be empty")
    else:
        if not isinstance(groups[0], list) or len(groups[0]) != 2:
            err("-", "LIFE_TABLE", "malformed: groups[0]")
        else:
            if groups[0][0] != 0:
                err("-", "LIFE_TABLE", "groups[0][0] must be 0")
            for i in range(len(groups) - 1):
                if not isinstance(groups[i], list) or len(groups[i]) != 2 or not isinstance(groups[i + 1], list) or len(groups[i + 1]) != 2:
                    err("-", "LIFE_TABLE", f"malformed: groups[{i}] or groups[{i+1}]")
                    break
                if groups[i][1] != groups[i + 1][0]:
                    err("-", "LIFE_TABLE", f"groups[{i}][1] != groups[{i+1}][0]")
                    break
            last = groups[-1]
            if not isinstance(last, list) or len(last) != 2:
                err("-", "LIFE_TABLE", "malformed: groups[-1]")
            else:
                if last[1] is not None:
                    err("-", "LIFE_TABLE", "last group's g1 must be None")
            for i, g in enumerate(groups):
                if not isinstance(g, list) or len(g) != 2:
                    continue
                if g[0] not in nodes:
                    err("-", "LIFE_TABLE", f"groups[{i}][0] not in nodes")
                if g[1] is not None and g[1] not in nodes:
                    err("-", "LIFE_TABLE", f"groups[{i}][1] not in nodes")

    if not cause_shares:
        err("-", "LIFE_SHARES", "missing code 1000 (all causes)")
        return

    codes = {}
    for cs in cause_shares:
        if not isinstance(cs, dict):
            continue
        code = cs.get("code")
        if code in codes:
            err("-", "LIFE_SHARES", "duplicate code")
        codes[code] = cs

    if "1000" not in codes:
        err("-", "LIFE_SHARES", "missing code 1000 (all causes)")
        return

    cs_all = codes["1000"]
    if not isinstance(cs_all, dict):
        err("-", "LIFE_SHARES", "malformed: code 1000 record")
        return

    for cs in cause_shares:
        if not isinstance(cs, dict):
            continue
        code = cs.get("code")
        rec_id = cs.get("id")
        if rec_id != "cs_" + str(code):
            err(rec_id if rec_id else "-", "LIFE_SHARES", f"id must be 'cs_{code}'")

        deaths = cs.get("deaths")
        share = cs.get("share")
        if not isinstance(deaths, dict) or not isinstance(share, dict):
            err(rec_id if rec_id else "-", "LIFE_SHARES", "malformed: deaths or share")
            continue

        for sex in ("male", "female"):
            d_sex = deaths.get(sex)
            s_sex = share.get(sex)
            if not isinstance(d_sex, list) or not isinstance(s_sex, list):
                err(rec_id if rec_id else "-", "LIFE_SHARES", f"malformed: {sex} deaths or share")
                continue

            if len(d_sex) != len(groups) or len(s_sex) != len(groups):
                err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} length mismatch with groups")
                continue

            d_all_sex = cs_all.get("deaths", {}).get(sex)
            if not isinstance(d_all_sex, list) or len(d_all_sex) != len(groups):
                err(rec_id if rec_id else "-", "LIFE_SHARES", f"malformed: all-causes {sex} deaths")
                continue

            for i in range(len(groups)):
                d_val = d_sex[i]
                s_val = s_sex[i]
                d_all_val = d_all_sex[i]

                if not isinstance(d_val, (int, float)) or isinstance(d_val, bool):
                    err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} deaths[{i}] malformed")
                    continue
                if not isinstance(s_val, (int, float)) or isinstance(s_val, bool):
                    err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} share[{i}] malformed")
                    continue
                if not isinstance(d_all_val, (int, float)) or isinstance(d_all_val, bool):
                    err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} all-causes deaths[{i}] malformed")
                    continue

                if s_val < 0 or s_val > 1:
                    err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} share[{i}] out of [0, 1]")

                if d_val > d_all_val:
                    err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} deaths[{i}] exceeds all-causes")

                if d_all_val == 0:
                    if s_val != 0.0:
                        err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} share[{i}] must be 0 when all-causes deaths is 0")
                else:
                    expected = d_val / d_all_val
                    if abs(s_val - expected) > 1e-12:
                        err(rec_id if rec_id else "-", "LIFE_SHARES", f"{sex} share[{i}] mismatch")

DIET_LINKS = {"default_id": ("balance", "method_estimate"), "high_id": ("high_d10",), "ref614_id": ("norm614",), "info_id": ("balance", "survey_ref")}

def check_diet_refs(ds, records, errors):
    # #FR-83 W03: группа рациона ссылается на существующую запись нужного ряда и той же группы значений; value = src_value · src_factor; code групп не повторяется
    vals = {r["id"]: r for r in records if r.get("kind") == "value"}
    grps = [r for r in records if r.get("kind") == "group"]
    for r in vals.values():
        if "src_value" in r and abs(r["value"] - r["src_value"] * r.get("src_factor", 1)) > 1e-9 * r["value"]:
            errors.append(f"{ds}|{r['id']}|DIET_REF|value != src_value * src_factor")
    for key in ("code",):  # #FR-85: priority снят вместе с правилами распознавания по основам
        seen = [g[key] for g in grps]
        for dup in sorted({x for x in seen if seen.count(x) > 1}):
            errors.append(f"{ds}|-|DIET_REF|duplicate group {key}: {dup}")
    for g in grps:
        for field, series in DIET_LINKS.items():
            if field not in g: continue
            t = vals.get(g[field])
            if t is None: errors.append(f"{ds}|{g['id']}|DIET_REF|{field} -> {g[field]}: no such value record")
            elif t["series"] not in series: errors.append(f"{ds}|{g['id']}|DIET_REF|{field} -> {t['id']}: series {t['series']} not in {series}")
            elif field != "info_id" and (t["group"] != g.get("value_group") or t["unit"] != "kg/year"): errors.append(f"{ds}|{g['id']}|DIET_REF|{field} -> {t['id']}: group/unit mismatch")

def check_warn_note(ds, rec, errors):
    if rec.get("level") == "⚠️":
        fields = ["note", "status", "status_2026", "source_anomaly"]
        if not any(rec.get(f) and str(rec[f]).strip() for f in fields):
            errors.append(f"{ds}|{rec.get('id', '?')}|WARN_NOTE|⚠️ record without explanation")

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--data-dir", default=None)
    p.add_argument("--schema-dir", default=None)
    p.add_argument("--src-dir", default=None)
    args = p.parse_args()
    script_dir = Path(__file__).resolve().parent
    data_dir = (script_dir / "../public/data").resolve() if not args.data_dir else Path(args.data_dir).resolve()
    schema_dir = (script_dir / "../schema").resolve() if not args.schema_dir else Path(args.schema_dir).resolve()
    src_dir = (script_dir / "../data-src").resolve() if not args.src_dir else Path(args.src_dir).resolve()

    errors = []
    datasets = check_index(data_dir, errors)
    if not datasets and errors:
        counts = defaultdict(int)
        for e in errors: counts[e.split("|")[2]] += 1
        print(json.dumps({"ok": False, "error_count": len(errors), "records": 0, "rules": dict(counts), "errors": errors}, ensure_ascii=False, indent=1))
        return 1

    total_records = 0
    seen_ids = {}
    rule_counts = defaultdict(int)
    by_ds = {doc.get("dataset"): doc.get("records", []) for _, doc in datasets}  # #FR-85: ссылки словаря продуктов на другие наборы

    for e, doc in datasets:
        ds = doc.get("dataset", "?")
        if not check_envelope(e, doc, src_dir, errors): continue
        validator = load_validator(ds, schema_dir / f"{ds}.schema.json", errors)
        for rec in doc.get("records", []):
            total_records += 1
            rid = rec.get("id", "?") if isinstance(rec, dict) else "?"
            if not isinstance(rec, dict): continue
            
            if validator is not None:
                check_schema(ds, rec, validator, errors)
            check_nonfinite(ds, rec, errors)
            
            if rid in seen_ids:
                errors.append(f"{ds}|{rid}|DUP_ID|duplicate id, first seen in {seen_ids[rid]}")
            else:
                seen_ids[rid] = ds
            
            check_order(ds, rec, errors)
            if ds == "dose_coeff": check_dose_range(ds, rec, errors)
            if ds == "processing": check_proc_range(ds, rec, errors)
            if ds == "transfer": check_transfer_range(ds, rec, errors)
            if ds.startswith("limits_"): check_limit_range(ds, rec, errors)
            if ds == "life_risks": check_life_risks_range(ds, rec, errors)
            check_warn_note(ds, rec, errors)
        if ds == "life_risks": check_life_table_set(ds, doc.get("records", []), errors)
        if ds == "diet": check_diet_refs(ds, doc.get("records", []), errors)
        if ds == "products": check_products(ds, doc.get("records", []), by_ds, errors)

    for e in errors: rule_counts[e.split("|")[2]] += 1
    print(json.dumps({"ok": not errors, "error_count": len(errors), "records": total_records, "rules": dict(rule_counts), "errors": errors}, ensure_ascii=False, indent=1))
    return 1 if errors else 0

if __name__ == "__main__": sys.exit(main())
