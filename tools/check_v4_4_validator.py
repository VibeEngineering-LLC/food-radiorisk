import sys
import json
import shutil
import hashlib
import tempfile
import subprocess
import pathlib

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    root = pathlib.Path(__file__).resolve().parent.parent
    validator = root / "tools" / "validate_data.py"
    tmp = pathlib.Path(tempfile.mkdtemp())
    try:
        shutil.copytree(root / "public" / "data", tmp / "data")

        def run(data_dir):
            result = subprocess.run(
                [sys.executable, str(validator), "--data-dir", str(data_dir)],
                capture_output=True,
                text=True,
                encoding="utf-8"
            )
            return result.returncode, json.loads(result.stdout)

        code, data = run(tmp / "data")
        if code != 0 or not data.get("ok"):
            print("FAIL baseline")
            sys.exit(1)

        proc_path = tmp / "data" / "processing.json"
        with open(proc_path, "r", encoding="utf-8") as f:
            doc = json.load(f)

        for record in doc.get("records", []):
            if record.get("id") == "tec16_txt_alcohol_oil":
                record["value_best"] = 0.01
                record["value_min"] = 0.01
                record["value_max"] = None
                break

        new_content = json.dumps(doc, ensure_ascii=False, indent=1)
        new_bytes = new_content.encode("utf-8")
        with open(proc_path, "wb") as f:
            f.write(new_bytes)

        index_path = tmp / "data" / "index.json"
        with open(index_path, "r", encoding="utf-8") as f:
            index = json.load(f)

        for entry in index.get("datasets", []):
            if entry.get("file") == "processing.json":
                entry["json_sha256"] = hashlib.sha256(new_bytes).hexdigest()
                break

        index_content = json.dumps(index, ensure_ascii=False, indent=1)
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(index_content)

        code, data = run(tmp / "data")
        errors = data.get("errors", [])
        relevant_errors = [e for e in errors if "|PROC_BEST_IS_BOUND|" in str(e)]

        if code == 1 and len(relevant_errors) == 1 and "tec16_txt_alcohol_oil" in relevant_errors[0]:
            print(f"OK: mutated record is rejected: {relevant_errors[0]}")
            sys.exit(0)
        else:
            print("FAIL")
            print(json.dumps(errors, indent=2))
            sys.exit(1)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    main()
