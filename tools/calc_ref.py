"""Reference re-computation of food-radioactivity dose calculator.

Sub-commands:
make: build scenario file from real data.
calc: compute reference results.

Formulas follow IAEA TRS-472 sect. 11 and МУК 2.6.1.1194-03 п. 6.1–6.5.
"""
import sys, json, math, argparse
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent

def main() -> int:
    try:
        ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest="cmd")
        sp.add_parser("make"); sp.add_parser("calc").add_argument("--out", default=str(ROOT / "audit" / "recount-py.json"))
        args = ap.parse_args()
        if args.cmd == "make":
            def load(n): return json.loads((ROOT / "public" / "data" / n).read_bytes())["records"]
            dose_c, proc, lims, transf = load("dose_coeff.json"), load("processing.json"), load("limits_ru.json"), load("transfer.json")
            frs = [r["value_best"] for r in proc if r.get("quantity") == "Fr" and isinstance(r.get("value_best"), (int, float)) and "source_anomaly" not in r]
            dose = [{"id": r["id"], "activity": 1000.0 * (1 + i % 7), "portionKg": 0.25, "portionsPerYear": 40, "fr": frs[i % len(frs)], "e": r["value"], "r": 5.7e-2} for i, r in enumerate(dose_c)]
            cs = [c for c in lims if c.get("nuclide") == "Cs-137" and c.get("unit") == "Bq/kg" and isinstance(c.get("value"), (int, float))]
            compliance = []
            for i, c in enumerate(cs):
                s = next((x for x in lims if x.get("nuclide") == "Sr-90" and x.get("unit") == "Bq/kg" and isinstance(x.get("value"), (int, float)) and x.get("food_group_code") == c.get("food_group_code")), None)
                k = 0.2 + 0.1 * (i % 12); items = [{"a": k * c["value"], "da": 0.15 * c["value"], "h": c["value"]}]
                if s: items.append({"a": 0.5 * k * s["value"], "da": 0.2 * s["value"], "h": s["value"]})
                compliance.append({"id": c["id"], "items": items})
            soil = [{"id": r["id"], "deposition": 37.0 * (1 + i % 15), "rho": 1000.0 + 50.0 * (i % 10), "depth": 0.1 if r.get("food_group") == "pasture" else 0.2, "fv": r["gm"], "dryMatter": 5.0 + (i % 90)} for i, r in enumerate(transf) if r.get("quantity") == "Fv" and isinstance(r.get("gm"), (int, float))]
            isnum = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
            tags = [r for r in transf if r.get("quantity") == "Tag" and (isnum(r.get("gm")) or isnum(r.get("am")))]
            tag = [{"id": r["id"], "deposition": 37.0 * (1 + i % 40), "tag": r["gm"] if isnum(r.get("gm")) else r["am"]} for i, r in enumerate(tags)]
            decay = [{"id": f"T{T}_dt{dt}", "A": 1000.0, "T": T, "dt": dt} for T in [11001.1, 754.2, 8.0233, 10518.4, 1600.0 * 365.25] for dt in [0.0, 365.25, 3652.5, -100.0, 36525.0]]
            out = {"dose": dose, "compliance": compliance, "soil": soil, "tag": tag, "decay": decay}
            (ROOT / "tests" / "fixtures").mkdir(parents=True, exist_ok=True)
            (ROOT / "tests" / "fixtures" / "recount_scenarios.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(json.dumps({"ok": True, "counts": {k: len(v) for k, v in out.items()}}))
        elif args.cmd == "calc":
            data = json.loads((ROOT / "tests" / "fixtures" / "recount_scenarios.json").read_bytes())
            res = {"dose": [], "compliance": [], "soil": [], "tag": [], "decay": []}
            for r in data["dose"]:
                intake = r["activity"] * r["portionKg"] * r["portionsPerYear"] * r["fr"]; dose = intake * r["e"]; risk = dose * r["r"]
                pgp = 1e-3 / r["e"]; maxMass = pgp / (r["activity"] * r["fr"]) if r["activity"] * r["fr"] != 0 else None
                res["dose"].append({"id": r["id"], "intake": intake, "dose": dose, "risk": risk, "pgp": pgp, "maxMass": maxMass})
            for c in data["compliance"]:
                B = sum(i["a"] / i["h"] for i in c["items"]); dB = math.sqrt(sum((i["da"] / i["h"]) ** 2 for i in c["items"]))
                verdict = "conforms" if B + dB <= 1 else ("nonconforms" if B - dB > 1 else "undetermined")
                res["compliance"].append({"id": c["id"], "B": B, "dB": dB, "verdict": verdict, "precisionOk": dB <= 0.3})
            for s in data["soil"]:
                soil = s["deposition"] * 1000 / (s["rho"] * s["depth"]); plantDry = soil * s["fv"]; plantFresh = plantDry * s["dryMatter"] / 100
                res["soil"].append({"id": s["id"], "soil": soil, "plantDry": plantDry, "plantFresh": plantFresh})
            for t in data["tag"]: res["tag"].append({"id": t["id"], "product": t["deposition"] * 1000 * t["tag"]})
            for d in data["decay"]: res["decay"].append({"id": d["id"], "A_t": d["A"] * 2 ** (-d["dt"] / d["T"])})
            out_str = json.dumps(res, ensure_ascii=False, indent=1) + "\n"
            print(out_str); Path(args.out).parent.mkdir(parents=True, exist_ok=True); Path(args.out).write_text(out_str, encoding="utf-8")
        return 0
    except Exception as e: print(json.dumps({"ok": False, "error": str(e)})); return 1

if __name__ == "__main__": sys.exit(main())
