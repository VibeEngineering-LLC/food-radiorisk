"""Mutation acceptance test for tools/validate_data.py."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
data = root / "public" / "data"
src = root / "data-src"
schema = root / "schema"
validator = root / "tools" / "validate_data.py"


def run(data_dir, src_dir):
    result = subprocess.run(
        [sys.executable, str(validator), "--data-dir", str(data_dir),
         "--src-dir", str(src_dir), "--schema-dir", str(schema)],
        capture_output=True, env={**os.environ, "PYTHONIOENCODING": "utf-8"}
    )
    stdout = result.stdout.decode("utf-8")
    try:
        report = json.loads(stdout)
    except Exception:
        report = {"error_count": -1, "rules": {}, "errors": [result.stderr.decode("utf-8", errors="replace")]}
    return result.returncode, report


def fresh():
    tmp = Path(tempfile.mkdtemp(prefix="mut_"))
    shutil.copytree(data, tmp / "data")
    shutil.copytree(src, tmp / "src")
    return tmp, tmp / "data", tmp / "src"


def load(d, ds):
    with open(d / f"{ds}.json", encoding="utf-8") as f:
        return json.load(f)


def save(d, ds, doc, fix_index=True):
    content = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
    path = d / f"{ds}.json"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    if fix_index:
        import hashlib
        h = hashlib.sha256(content.encode("utf-8")).hexdigest()
        idx_path = d / "index.json"
        with open(idx_path, encoding="utf-8") as f:
            idx = json.load(f)
        for entry in idx["datasets"]:
            if entry.get("file") == f"{ds}.json":
                entry["json_sha256"] = h
                break
        else:
            raise SystemExit(f"index.json: no entry for {ds}.json")
        with open(idx_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(idx, ensure_ascii=False, indent=1) + "\n")


def first(doc, pred):
    for r in doc.get("records", []):
        if pred(r):
            return r
    raise SystemExit(f"no record for mutation {pred}")


# (имя мутации, правило, которое обязано сработать ровно один раз); логика мутаций — apply_mutation()
MUTATIONS = [
    ("lost_minus", "DOSE_RANGE"),
    ("fr_above_1", "PROC_RANGE"),
    ("reduction_below_1", "PROC_RANGE"),
    ("missing_loc", "SCHEMA"),
    ("string_number", "SCHEMA"),
    ("extra_field", "SCHEMA"),
    ("dup_id", "DUP_ID"),
    ("anomaly_removed", "ORDER"),
    ("warn_without_note", "WARN_NOTE"),
    ("negative_limit", "LIMIT_RANGE"),
    ("stale_source", "STALE"),
    ("index_tamper", "INDEX_SHA"),
    ("nan_value", "NONFINITE"),
    ("order_swapped", "ORDER"),
    ("negative_min", "TRANSFER_RANGE"),
    ("stale_part", "STALE"),
]


def apply_mutation(name, d, s):
    if name == "lost_minus":
        doc = load(d, "dose_coeff")
        r = first(doc, lambda x: x.get("nuclide") == "Cs-137" and x.get("age") == "adult")
        if isinstance(r.get("value"), (int, float)):
            r["value"] *= 1e16
        save(d, "dose_coeff", doc)
    elif name == "fr_above_1":
        doc = load(d, "processing")
        r = first(doc, lambda x: x.get("quantity") == "Fr" and isinstance(x.get("value_best"), (int, float)) and not x.get("source_anomaly"))
        r["value_best"] = 1.5; r["value_min"] = None; r["value_max"] = None
        save(d, "processing", doc)
    elif name == "reduction_below_1":
        doc = load(d, "processing")
        r = first(doc, lambda x: x.get("quantity") == "reduction_factor" and isinstance(x.get("value_best"), (int, float)))
        r["value_best"] = 0.5; r["value_min"] = None; r["value_max"] = None
        save(d, "processing", doc)
    elif name == "missing_loc":
        doc = load(d, "limits_ru")
        del doc["records"][0]["loc"]
        save(d, "limits_ru", doc)
    elif name == "string_number":
        doc = load(d, "transfer")
        r = first(doc, lambda x: isinstance(x.get("min"), (int, float)))
        r["min"] = "8e-05"
        save(d, "transfer", doc)
    elif name == "extra_field":
        doc = load(d, "risk")
        doc["records"][0]["valeu"] = 1
        save(d, "risk", doc)
    elif name == "dup_id":
        doc = load(d, "risk")
        doc["records"][1]["id"] = doc["records"][0]["id"]
        save(d, "risk", doc)
    elif name == "anomaly_removed":
        doc = load(d, "transfer")
        r = first(doc, lambda x: x.get("id") == "trs472_fv_po_leguminous_fodder_stems_and_shoots_all")
        del r["source_anomaly"]
        save(d, "transfer", doc)
    elif name == "warn_without_note":
        doc = load(d, "transfer")
        r = first(doc, lambda x: x.get("level") == "⚠️" and not x.get("source_anomaly"))
        r["note"] = ""
        save(d, "transfer", doc)
    elif name == "negative_limit":
        doc = load(d, "limits_foreign")
        r = first(doc, lambda x: isinstance(x.get("value"), (int, float)))
        r["value"] = -r["value"]
        save(d, "limits_foreign", doc)
    elif name == "stale_source":
        with open(s / "risk.yaml", "ab") as f:
            f.write(b"# mutated\n")
    elif name == "index_tamper":
        doc = load(d, "risk")
        r = first(doc, lambda x: isinstance(x.get("quote"), str))
        r["quote"] += " X"
        save(d, "risk", doc, fix_index=False)
    elif name == "nan_value":
        doc = load(d, "risk")
        r = first(doc, lambda x: isinstance(x.get("value"), (int, float)))
        r["value"] = float("nan")
        save(d, "risk", doc)
    elif name == "stale_part":
        (s / "risk.d").mkdir(exist_ok=True)
        (s / "risk.d" / "zz-new.yaml").write_text("[]\n", encoding="utf-8")
    elif name == "negative_min":
        doc = load(d, "transfer")
        r = first(doc, lambda x: x.get("id") == "resrad_mixing_layer_depth")
        r["min"] = -0.1
        save(d, "transfer", doc)
    elif name == "order_swapped":
        doc = load(d, "transfer")
        r = first(doc, lambda x: all(isinstance(x.get(k), (int, float)) for k in ["min", "gm", "max"]) and x.get("am") is None and x["min"] < x["max"] and not x.get("source_anomaly"))
        r["min"], r["max"] = r["max"], r["min"]
        save(d, "transfer", doc)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    results = []
    clean_ok = False
    tmp, d, s = fresh()
    try:
        rc, report = run(d, s)
        clean_ok = rc == 0 and report.get("error_count") == 0
        clean = {"passed": clean_ok, "rc": rc, "error_count": report.get("error_count"), "records": report.get("records")}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    for name, expected_rule in MUTATIONS:
        tmp, d, s = fresh()
        try:
            apply_mutation(name, d, s)
            rc, report = run(d, s)
            err_count = report.get("error_count", -1)
            rules = report.get("rules", {})
            first_err = report.get("errors", [None])[0] if report.get("errors") else None
            passed = rc == 1 and err_count == 1 and rules == {expected_rule: 1}
            results.append({"name": name, "expected": expected_rule, "rc": rc, "error_count": err_count, "rules": rules, "pass": passed, "first_error": first_err})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    all_pass = clean_ok and all(r["pass"] for r in results)
    output = {"ok": all_pass, "clean": clean, "mutations": results, "passed": sum(1 for r in results if r["pass"]), "total": len(results)}
    print(json.dumps(output, ensure_ascii=False, indent=1))
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
