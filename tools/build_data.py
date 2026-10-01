"""Convert hand-written YAML data files into JSON files for a static web app."""
import argparse, hashlib, json, pathlib, sys, yaml
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import datasrc  # части набора: data-src/<набор>.yaml + data-src/<набор>.d/*.yaml
from datetime import date, datetime

EXACT_UNITS = {
    "(Bq/kg)/(kBq/m2)": ("m2/kg", 1e-3, False),  # 1 (Bq/kg)/(kBq/m2) = 1e-3 m2/kg
    "m2/kg (values given as n*1e-3 m2/kg)": ("m2/kg", 1.0, False),  # already scaled
}

def to_json(v):
    if isinstance(v, (date, datetime)): return v.isoformat()
    if isinstance(v, list): return [to_json(x) for x in v]
    if isinstance(v, dict): return {k: to_json(val) for k, val in v.items()}
    return v

def normalize_unit(r):
    u = r.get("unit"); q = r.get("quantity")
    if not u or u == "": return (None, None, False)
    if u.startswith("NOT ESTABLISHED"): return (None, None, False)
    if u.startswith("unit NOT stated"): return ("m2/kg", 1e-3, True)
    if u in EXACT_UNITS: return EXACT_UNITS[u]
    if u == "% of daily ration intake per 1 kg (L) of product":
        return ("d/L", 0.01, False) if q == "Fm" else ("d/kg", 0.01, False)
    return (u, 1.0, False)

def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    p = pathlib.Path(__file__).resolve()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src-dir", default=str(p.parent / "../data-src"))
    ap.add_argument("--out-dir", default=str(p.parent / "../public/data"))
    a = ap.parse_args(); src = pathlib.Path(a.src_dir).resolve(); out = pathlib.Path(a.out_dir).resolve()
    files = sorted(src.glob("*.yaml"))
    if not files: print(json.dumps({"ok": False, "error": "no yaml files"})); return 1
    out.mkdir(parents=True, exist_ok=True); datasets = []; total = 0
    for f in files:
        ps = datasrc.parts(src, f.stem); sha = datasrc.combined_sha(ps, src); data = []
        for part in ps:
            try: chunk = yaml.safe_load(part.read_bytes().decode("utf-8"))
            except Exception as e: print(json.dumps({"ok": False, "error": f"{part.name}: {e}"}, ensure_ascii=False)); return 1
            if not isinstance(chunk, list) or any(not isinstance(r, dict) for r in chunk):
                print(json.dumps({"ok": False, "error": f"{part.name}: top level must be a list of mappings"}, ensure_ascii=False)); return 1
            data += chunk
        records = []
        for r in data:
            out_r = {k: to_json(v) for k, v in r.items()}
            norm, factor, inferred = normalize_unit(r)
            out_r["unit_norm"] = norm; out_r["unit_factor"] = factor; out_r["unit_inferred"] = inferred
            records.append(out_r)
        obj = {"dataset": f.stem, "schema_version": 1, "source_file": f"data-src/{f.name}",
               "source_parts": [p.relative_to(src).as_posix() for p in ps],
               "source_sha256": sha, "record_count": len(records), "records": records}
        content = json.dumps(obj, ensure_ascii=False, indent=1) + "\n"
        (out / f"{f.stem}.json").write_text(content, encoding="utf-8", newline="\n")
        jsha = hashlib.sha256(content.encode("utf-8")).hexdigest()
        datasets.append({"dataset": f.stem, "file": f"{f.stem}.json", "record_count": len(records),
                         "source_sha256": sha, "json_sha256": jsha}); total += len(records)
    idx = {"schema_version": 1, "datasets": datasets}
    (out / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"ok": True, "datasets": {d["dataset"]: d["record_count"] for d in datasets}, "total": total}, ensure_ascii=False))
    return 0

if __name__ == "__main__": sys.exit(main())
