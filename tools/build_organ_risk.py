"""#FR-75: коэффициенты риска рака по локализациям при поступлении с пищей из EPA FGR 13 (FGR13ING.RBS) -> data-src/organ_risk.yaml.
Формат и проверка пересчётом: audit/fgr13-risk-format-2026-10-04.md (риск на 1 Бк поступления, пожизненный, пол усреднён)."""
import argparse, hashlib, json, sys, yaml
from pathlib import Path

WANT = ['Cs-134','Cs-137','Sr-90','I-131','K-40','Ra-226','Pb-210','Po-210','U-234','U-238','Th-228','Th-232']
BANDS = ['0-5', '5-15', '15-25', '25-70', '0-110']
SITES = ['esophagus','stomach','colon','liver','lung','bone','skin','breast','ovary','bladder','kidney','thyroid','leukemia','residual']

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument('--rbs', default=str(root / 'audit/_lit_dcf/pak/fgr13pak/FGR13ING.RBS'))
    ap.add_argument('--out', default=str(root / 'data-src/organ_risk.yaml'))
    a = ap.parse_args()
    raw = open(a.rbs, encoding='latin-1', newline='').read()
    lines = raw.split('\r\n')[3:-2]
    sha = hashlib.sha256(raw.encode('latin-1')).hexdigest()
    recs, seen, bad = [], set(), []
    for i in range(0, len(lines), 15):
        blk = lines[i:i+15]
        if len(blk) < 15: break
        nu = blk[0][:7].strip()
        if blk[0][8:15] != 'Dietary' or nu not in WANT: continue
        f1 = float(blk[0][16:23])
        fi = sum(1 for x in seen if x[0] == nu)
        seen.add((nu, f1))
        n = i + 4
        for b in range(5):
            m, mo = {}, {}
            for j, s in enumerate(SITES):
                m[s] = float(blk[j][33+9*b:33+9*b+9])
                mo[s] = float(blk[j][33+9*(5+b):33+9*(5+b)+9])
            tm = float(blk[14][33+9*b:33+9*b+9])
            tmo = float(blk[14][33+9*(5+b):33+9*(5+b)+9])
            if abs(tm - sum(m.values())) > 0.02 * max(tm, 1e-12) or abs(tmo - sum(mo.values())) > 0.02 * max(tmo, 1e-12):
                bad.append(f"fgr13r_{nu.lower().replace('-', '')}_{BANDS[b]}_f{fi}")
            recs.append({'id': f"fgr13r_{nu.lower().replace('-', '')}_{BANDS[b]}_f{fi}", 'nuclide': nu, 'age_band': BANDS[b],
                         'route': 'ingestion', 'pathway': 'dietary', 'f1': f1, 'form_idx': fi, 'source': 'EPA_FGR13',
                         'loc': f"FGR13ING.RBS, строка {n}", 'unit': '1/Bq', 'mortality': m, 'morbidity': mo,
                         'total_mortality': tm, 'total_morbidity': tmo})
    missing = [w for w in WANT if w not in {x[0] for x in seen}]
    if missing or bad:
        print(json.dumps({"ok": False, "bad": bad, "missing": missing}, ensure_ascii=False))
        return 1
    out = f"# organ_risk.yaml — {Path(a.rbs).name}, sha256={sha}\n# age_band = интервал возраста хронического поступления, риск на 1 Бк, пол усреднён\n"
    out += yaml.safe_dump(recs, allow_unicode=True, sort_keys=False, default_flow_style=False, width=200)
    open(a.out, 'w', encoding='utf-8', newline='\n').write(out)
    print(json.dumps({"ok": True, "records": len(recs), "nuclides": sorted({x[0] for x in seen})}, ensure_ascii=False))
    return 0

if __name__ == '__main__': sys.exit(main())
