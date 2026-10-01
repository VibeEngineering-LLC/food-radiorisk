"""Validate built JSON data files of a radiation-dose calculator."""
import sys, json, hashlib, argparse
from pathlib import Path
from collections import defaultdict
import jsonschema
sys.path.insert(0, str(Path(__file__).resolve().parent))
import datasrc  # тот же расчёт sha частей, что в build_data.py

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
            check_warn_note(ds, rec, errors)

    for e in errors: rule_counts[e.split("|")[2]] += 1
    print(json.dumps({"ok": not errors, "error_count": len(errors), "records": total_records, "rules": dict(rule_counts), "errors": errors}, ensure_ascii=False, indent=1))
    return 1 if errors else 0

if __name__ == "__main__": sys.exit(main())
