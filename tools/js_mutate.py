"""Mutation acceptance for src/calc/core.js: each mutation from tests/fixtures/core_mutations.json must turn >=1 test red."""
import sys, json, shutil, subprocess, tempfile, re, pathlib
sys.stdout.reconfigure(encoding="utf-8")
root = pathlib.Path(__file__).resolve().parent.parent
TARGET = sys.argv[1] if len(sys.argv) > 1 else "src/calc/core.js"
MUTS = sys.argv[2] if len(sys.argv) > 2 else "tests/fixtures/core_mutations.json"
muts = json.loads((root / MUTS).read_text(encoding="utf-8"))
res, ok = [], True
for m in muts:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="jsmut_"))
    try:
        for d in ("src", "tests", "public"): shutil.copytree(root / d, tmp / d)
        shutil.copy(root / "package.json", tmp / "package.json")
        core = tmp / TARGET; t = core.read_text(encoding="utf-8")
        hits = t.count(m["from"]); core.write_text(t.replace(m["from"], m["to"], 1), encoding="utf-8")
        p = subprocess.run(["node", "--test", "tests/**/*.test.js"], cwd=tmp, capture_output=True, text=True, encoding="utf-8")
        fail = int((re.search(r"ℹ fail (\d+)", p.stdout) or [0, -1])[1])
        red = [l[2:].split(" (")[0] for l in p.stdout.splitlines() if l.startswith("✖ ") and "failing tests" not in l]
        passed = hits == 1 and fail >= 1; ok &= passed
        res.append({"name": m["name"], "hits": hits, "fail": fail, "pass": passed, "red": sorted(set(red))[:4]})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
print(json.dumps({"ok": ok, "killed": sum(r["pass"] for r in res), "total": len(res), "mutations": res}, ensure_ascii=False, indent=1))
sys.exit(0 if ok else 1)
