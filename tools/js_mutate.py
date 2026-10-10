"""Mutation acceptance for src/calc/core.js: each mutation from tests/fixtures/core_mutations.json must turn >=1 test red."""
import os, sys, json, shutil, subprocess, tempfile, re, pathlib
sys.stdout.reconfigure(encoding="utf-8")
root = pathlib.Path(__file__).resolve().parent.parent
STRICT = "--strict" in sys.argv  # #FR-81 D23: мутация обязана красить РОВНО ОДИН тест
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
TARGET = ARGS[0] if len(ARGS) > 0 else "src/calc/core.js"
MUTS = ARGS[1] if len(ARGS) > 1 else "tests/fixtures/core_mutations.json"
IGNORE = ("ds_css",)  # в копии нет vite-конфигов: ds_css.test.js красный без мутации — не считается
muts = json.loads((root / MUTS).read_text(encoding="utf-8"))
res, ok = [], True
for m in muts:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="jsmut_"))
    try:
        for d in ("src", "tests", "public", "tools"): shutil.copytree(root / d, tmp / d)  # tools — #FR-88 v18: тест слоя f запускает tools/check_form_fields.mjs
        shutil.copy(root / "package.json", tmp / "package.json")
        shutil.copy(root / "sources.html", tmp / "sources.html")  # #FR-88 v18: тест раздела «Известные ограничения»
        for extra in ("THIRD_PARTY_LICENSES.md", "README.md", "vite.config.js", "index.html"): shutil.copy(root / extra, tmp / extra)  # #FR-88 v24: тесты лицензий и README
        # #FR-81 P2-9: тесты рендера импортируют vite/react — в копии нужен node_modules (junction на настоящий, удаляется до rmtree)
        if (root / "node_modules").exists(): subprocess.run(["cmd", "/c", "mklink", "/J", str(tmp / "node_modules"), str(root / "node_modules")], capture_output=True)
        core = tmp / m.get("file", TARGET); t = core.read_text(encoding="utf-8")  # "file" в мутации (#FR-79) — свой целевой файл, иначе общий TARGET
        hits = t.count(m["from"]); core.write_text(t.replace(m["from"], m["to"], 1), encoding="utf-8")
        p = subprocess.run(["node", "--test", "tests/**/*.test.js"], cwd=tmp, capture_output=True, text=True, encoding="utf-8")
        fail = int((re.search(r"ℹ fail (\d+)", p.stdout) or [0, -1])[1])
        red = [l[2:].split(" (")[0] for l in p.stdout.splitlines() if l.startswith("✖ ") and "failing tests" not in l and not any(i in l for i in IGNORE)]
        # красные тесты — записи «test at <файл>:<строка>» итогового списка, без игнорируемых файлов
        leaves = [l for l in p.stdout.splitlines() if l.startswith("test at ") and not any(i in l for i in IGNORE)]
        passed = hits == 1 and fail >= 1 and len(leaves) >= 1 and (len(leaves) == 1 or not STRICT); ok &= passed
        res.append({"name": m["name"], "hits": hits, "fail": fail, "red_tests": len(leaves), "pass": passed, "red": sorted(set(red))[:4]})
    finally:
        if (tmp / "node_modules").exists(): os.rmdir(tmp / "node_modules")  # только ссылка, не содержимое
        shutil.rmtree(tmp, ignore_errors=True)
print(json.dumps({"ok": ok, "killed": sum(r["pass"] for r in res), "total": len(res), "mutations": res}, ensure_ascii=False, indent=1))
sys.exit(0 if ok else 1)
