"""#FR-79: сверка data-src/life_risks.yaml с расчётом tools/risks_lifetime_calc.py --json (исходные таблицы — audit/_lit_risks/).
Печатает наибольшее расхождение (абсолютное и относительное) и число сверенных значений; код возврата 1, если относительное расхождение > 1e-5.
Запуск: PYTHONIOENCODING=utf-8 python tools/risks_lifetime_verify.py"""
import json, pathlib, subprocess, sys, yaml
sys.stdout.reconfigure(encoding="utf-8")
root = pathlib.Path(__file__).resolve().parent.parent
CODE = {"lr_all_causes": "1000", "lr_circulatory": "1064", "lr_neoplasms": "1026", "lr_lung_cancer": "1034", "lr_external": "1095",
        "lr_transport": "1096", "lr_suicide": "1101", "lr_poisoning": "1100", "lr_homicide": "1102", "lr_falls": "1097", "lr_fire": "1099"}
calc = json.loads(subprocess.run([sys.executable, str(root / "tools" / "risks_lifetime_calc.py"), "--json"], capture_output=True, text=True, encoding="utf-8", check=True).stdout)
recs = {r["id"]: r for r in yaml.safe_load((root / "data-src" / "life_risks.yaml").read_text(encoding="utf-8"))}
n, worst_abs, worst_rel = 0, 0.0, 0.0
for rid, code in CODE.items():
    for col in ("adult", "child"):
        for sex in ("both", "male", "female"):
            y, c = recs[rid][col][sex], calc[code][col][sex]
            n += 1; worst_abs = max(worst_abs, abs(y - c)); worst_rel = max(worst_rel, abs(y - c) / c)
print(f"сверено значений: {n}; наибольшее расхождение: абсолютное {worst_abs:.3e}, относительное {worst_rel:.3e}")
sys.exit(0 if n == 66 and worst_rel <= 1e-5 else 1)
