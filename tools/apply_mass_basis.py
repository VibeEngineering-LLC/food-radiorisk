"""#FR-33: проставить основу массы КП (Tag/KP) с mass_basis null по правилам data-src/mass_basis_fr33.json. Идемпотентен."""
import json, pathlib, re, sys
sys.stdout.reconfigure(encoding="utf-8")
root = pathlib.Path(__file__).resolve().parent.parent
rules = [(re.compile(p), b, s, n) for p, b, s, n in json.loads((root / "data-src/mass_basis_fr33.json").read_text(encoding="utf-8"))["rules"]]
hits, miss = 0, []
for f in [root / "data-src/transfer.yaml", *sorted((root / "data-src/transfer.d").glob("*.yaml"))]:
    blocks = re.split(r"(?m)^(?=- {?id: )", f.read_text(encoding="utf-8"))
    for i, b in enumerate(blocks):
        m = re.match(r'- {?id: "?([^"\n]+)"?', b)
        if not m or not re.search(r'quantity: "?(Tag|KP)"?[,\n]', b) or not re.search(r"mass_basis: null[,\n]", b):
            continue
        rule = next((r for r in rules if r[0].search(m.group(1))), None)
        if not rule: miss.append(m.group(1)); continue
        extra = f'  mass_basis_status: "{rule[2]}"\n  mass_basis_note: {json.dumps(rule[3], ensure_ascii=False)}\n'
        if re.search(r"(?m)^  mass_basis: null$", b):
            blocks[i] = re.sub(r"(?m)^  mass_basis: null\n", f'  mass_basis: "{rule[1]}"\n' + extra, b, count=1)
        else:  # запись в одну строку: { ..., mass_basis: null, ... }
            blocks[i] = b.replace("mass_basis: null,", f'mass_basis: "{rule[1]}", mass_basis_status: "{rule[2]}", mass_basis_note: {json.dumps(rule[3], ensure_ascii=False)},', 1)
        hits += 1
    f.write_text("".join(blocks), encoding="utf-8", newline="\n")
print(json.dumps({"applied": hits, "no_rule": miss}, ensure_ascii=False))
sys.exit(1 if miss else 0)
