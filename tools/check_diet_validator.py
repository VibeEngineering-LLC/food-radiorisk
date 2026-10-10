"""Мутационная проверка валидатора данных и источника для набора diet."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def run_validator(data_dir: Path) -> tuple[int, dict]:
    proc = subprocess.run(
        [sys.executable, str(Path(__file__).resolve().parent / "validate_data.py"),
         "--data-dir", str(data_dir)],
        capture_output=True, text=True, encoding="utf-8"
    )
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        data = {"ok": False, "error_count": -1, "rules": {}, "errors": []}
    return proc.returncode, data


def run_source_check(diet_path: Path) -> tuple[int, str]:
    proc = subprocess.run(
        [sys.executable, str(Path(__file__).resolve().parent / "diet_source_check.py"),
         "--diet", str(diet_path)],
        capture_output=True, text=True, encoding="utf-8"
    )
    return proc.returncode, proc.stdout


def mutate(data_dir: Path, record_id: str, field: str, value) -> None:
    diet_path = data_dir / "diet.json"
    with open(diet_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    for rec in doc.get("records", []):
        if rec.get("id") == record_id:
            rec[field] = value
            break
    new_bytes = (json.dumps(doc, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    diet_path.write_bytes(new_bytes)

    index_path = data_dir / "index.json"
    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)
    import hashlib
    sha = hashlib.sha256(new_bytes).hexdigest()
    for ds in index.get("datasets", []):
        if ds.get("file") == "diet.json":
            ds["json_sha256"] = sha
            break
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    repo = Path(__file__).resolve().parent.parent
    src_data = repo / "public" / "data"
    tmp = tempfile.mkdtemp()
    passed = 0
    total = 0
    try:
        cases = [
            ("baseline", None, None, None),
            ("level_warning", "diet_bal2025_potato", "level", "\u26a0\ufe0f"),
            ("dangling_default_id", "diet_grp_potato", "default_id", "diet_no_such_record"),
            ("wrong_series", "diet_grp_potato", "default_id", "diet_d10_2025_potato"),
            ("derived_value", "diet_mu2153_mushrooms", "value", 7.4),
            ("source_number", "diet_bal2025_potato", "value", 84),
        ]
        for name, rec_id, field, val in cases:
            total += 1
            data_dir = Path(tmp) / name
            shutil.copytree(src_data, data_dir)
            if rec_id is not None:
                mutate(data_dir, rec_id, field, val)

            if name == "baseline":
                rc_v, data_v = run_validator(data_dir)
                rc_s, out_s = run_source_check(data_dir / "diet.json")
                last_line = out_s.strip().splitlines()[-1] if out_s.strip() else ""
                if rc_v == 0 and data_v.get("ok") is True and rc_s == 0 and last_line.startswith("расхождений: 0,"):
                    print(f"OK {name}")
                    passed += 1
                else:
                    print(f"FAIL {name}: validator rc={rc_v}, ok={data_v.get('ok')}, source rc={rc_s}, last={last_line}")

            elif name == "source_number":
                rc_s, out_s = run_source_check(data_dir / "diet.json")
                lines = out_s.strip().splitlines()
                last_line = lines[-1] if lines else ""
                has_rec = any("diet_bal2025_potato" in l for l in lines)
                if rc_s == 1 and has_rec and last_line.startswith("расхождений: 1,"):
                    print(f"OK {name}")
                    passed += 1
                else:
                    print(f"FAIL {name}: rc={rc_s}, has_rec={has_rec}, last={last_line}")

            else:
                rc_v, data_v = run_validator(data_dir)
                errors = data_v.get("errors", [])
                if name == "level_warning":
                    matching = [e for e in errors if "|SCHEMA|" in e and "diet_bal2025_potato" in e]
                    if rc_v == 1 and len(matching) == 1:
                        print(f"OK {name}")
                        passed += 1
                    else:
                        print(f"FAIL {name}: rc={rc_v}, errors={errors}")

                elif name == "dangling_default_id":
                    matching = [e for e in errors if "|DIET_REF|" in e and "diet_grp_potato" in e]
                    if rc_v == 1 and len(matching) == 1:
                        print(f"OK {name}")
                        passed += 1
                    else:
                        print(f"FAIL {name}: rc={rc_v}, errors={errors}")

                elif name == "wrong_series":
                    matching = [e for e in errors if "|DIET_REF|" in e and "diet_grp_potato" in e and "series" in e]
                    if rc_v == 1 and len(matching) == 1:
                        print(f"OK {name}")
                        passed += 1
                    else:
                        print(f"FAIL {name}: rc={rc_v}, errors={errors}")

                elif name == "derived_value":
                    matching = [e for e in errors if "|DIET_REF|" in e and "diet_mu2153_mushrooms" in e]
                    if rc_v == 1 and len(matching) == 1:
                        print(f"OK {name}")
                        passed += 1
                    else:
                        print(f"FAIL {name}: rc={rc_v}, errors={errors}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"cases: {passed}/{total}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
