"""#FR-85: product dictionary data-src/products.yaml from the draft data-src/products.draft.yaml and the decisions tools/fr85_decisions.yaml (D-024)."""
import sys
import json
import argparse
import re
import pathlib
import yaml

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from products_check import normalize_name, words_of, key_of, core_words, modifier_map, check_products

MODIFIERS = [
  {"id": "mod_dried", "kind": "modifier", "state": "dried", "words": ["сушеный","сушеная","сушеное","сушеные","сухой","сухая","сухое","сухие","вяленый","вяленая","вяленое","вяленые","сублимированный","сублимированная","сублимированное","сублимированные"]},
  {"id": "mod_fresh", "kind": "modifier", "state": "fresh", "words": ["свежий","свежая","свежее","свежие"]},
  {"id": "mod_cooked", "kind": "modifier", "state": "cooked", "words": ["вареный","вареная","вареное","вареные","отварной","отварная","отварное","отварные"]},
  {"id": "mod_raw", "kind": "modifier", "state": "fresh", "words": ["сырой","сырая","сырое","сырые"]},
]
mods = modifier_map(MODIFIERS)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", default="data-src/products.draft.yaml")
    parser.add_argument("--decisions", default="tools/fr85_decisions.yaml")
    parser.add_argument("--data-dir", default="public/data")
    parser.add_argument("--out", default="data-src/products.yaml")
    parser.add_argument("--report", default=None)
    args = parser.parse_args()

    problems = []

    # Load inputs
    with open(args.draft, "r", encoding="utf-8") as f:
        draft = yaml.safe_load(f)
    if not isinstance(draft, list):
        draft = []

    with open(args.decisions, "r", encoding="utf-8") as f:
        dec = yaml.safe_load(f)
    if not isinstance(dec, dict):
        dec = {}

    def get_dec(key, default):
        v = dec.get(key)
        if v is None:
            return default
        return v

    split = get_dec("split", [])
    exclude = get_dec("exclude", {})
    merge = get_dec("merge", {})
    rename = get_dec("rename", {})
    add_synonyms = get_dec("add_synonyms", {})
    group_rules = get_dec("group_rules", {})
    codex_by_norm = get_dec("codex_by_norm", {})
    codex_default = get_dec("codex_default", [])
    processing_by_norm = get_dec("processing_by_norm", {})
    processing_by_diet = get_dec("processing_by_diet", {})
    processing_default = get_dec("processing_default", [])
    dry_by_norm = get_dec("dry_by_norm", {})
    set_dec = get_dec("set", {})
    add_dec = get_dec("add", [])
    dry_null = get_dec("dry_null", [])

    # Load data files
    data_dir = pathlib.Path(args.data_dir)
    def load_json(name):
        p = data_dir / f"{name}.json"
        if not p.exists():
            return []
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        return d.get("records", [])

    transfer_records = load_json("transfer")
    limits_ru_records = load_json("limits_ru")
    diet_records = load_json("diet")
    processing_records = load_json("processing")

    # Validate names
    draft_names = set()
    for d in draft:
        if isinstance(d, dict) and "name_ru" in d:
            draft_names.add(d["name_ru"])

    def check_name(name, context):
        if name not in draft_names:
            problems.append(f"unknown name: {name}")

    # Check all names in decisions
    for name in split:
        check_name(name, "split")
    for name in exclude:
        check_name(name, "exclude")
    for src, tgt in merge.items():
        check_name(src, "merge_src")
        check_name(tgt, "merge_tgt")
    for name in rename:
        check_name(name, "rename")
    for name in add_synonyms:
        check_name(name, "add_synonyms")
    for name in set_dec:
        check_name(name, "set")
    for name in dry_null:
        check_name(name, "dry_null")

    if problems:
        print(json.dumps({"ok": False, "problems": problems}, ensure_ascii=False, indent=1))
        sys.exit(1)

    # Build entries
    entries = {}
    for d in draft:
        if not isinstance(d, dict):
            continue
        name = d.get("name_ru")
        if name is None:
            continue
        entry = {
            "id": d.get("id"),
            "name_ru": name,
            "synonyms": list(d.get("synonyms", [])),
            "norm": [d.get("cur_norm_fresh"), d.get("cur_norm_dried")],
            "diet": None if d.get("cur_diet") in (None, "other") else d.get("cur_diet"),
            "base": d.get("cur_diet_base") is not False,
            "dry": d.get("cur_dry"),
            "why": "",
            "decided": None,
            "explicit": set(),
            "split": name in split
        }
        entries[name] = entry

    draft_count = len(entries)

    # Step 1: exclude
    excluded_count = 0
    for name in exclude:
        if name in entries:
            del entries[name]
            excluded_count += 1

    # Step 2: merge
    merged = []
    for src, tgt in merge.items():
        if src in entries and tgt in entries:
            entries[tgt]["synonyms"].extend(entries[src]["synonyms"])
            del entries[src]
            merged.append({"from": src, "to": tgt})

    # Step 3: rename
    for name, new_name in rename.items():
        if name in entries:
            entries[name]["name_ru"] = new_name

    # Step 4: add_synonyms
    for name, syns in add_synonyms.items():
        if name in entries:
            entries[name]["synonyms"].extend(syns)

    # Step 5: group_rules
    rule_applied = {}
    for name, entry in entries.items():
        if entry["norm"] == [None, None] and entry["diet"] in group_rules:
            rule = group_rules[entry["diet"]]
            entry["norm"] = list(rule.get("norm", [None, None]))
            entry["why"] = rule.get("why", "")
            entry["decided"] = rule.get("decided")
            if entry["diet"] not in rule_applied:
                rule_applied[entry["diet"]] = []
            rule_applied[entry["diet"]].append(name)

    # Step 6: set
    for name, s in set_dec.items():
        if name not in entries:
            continue
        entry = entries[name]
        if "norm" in s:
            entry["norm"] = list(s["norm"])
        if "diet" in s:
            entry["diet"] = s["diet"]
        if "base" in s:
            entry["base"] = bool(s["base"])
        if "why" in s:
            entry["why"] = s["why"]
        if "decided" in s:
            entry["decided"] = s["decided"]
        for k in ("codex", "processing", "dry_matter"):
            if k in s:
                entry[k] = s[k]
                entry["explicit"].add(k)
        if "dry_matter" in s:
            entry["dry"] = s["dry_matter"]

    # Step 7: add
    added_count = 0
    for item in add_dec:
        if not isinstance(item, dict):
            continue
        name = item.get("name_ru")
        if name is None:
            continue
        if name in entries:
            problems.append(f"add: name already exists: {name}")
            continue
        entry = {
            "id": item.get("id"),
            "name_ru": name,
            "synonyms": list(item.get("synonyms", [])),
            "norm": list(item.get("norm", [None, None])),
            "diet": item.get("diet"),
            "base": item.get("base", True),
            "dry": item.get("dry_matter"),
            "why": item.get("why", ""),
            "decided": item.get("decided"),
            "explicit": set(),
            "split": False
        }
        for k in ("codex", "processing", "dry_matter"):
            if k in item:
                entry[k] = item[k]
                entry["explicit"].add(k)
        if "dry_matter" in item:
            entry["dry"] = item["dry_matter"]
        entries[name] = entry
        added_count += 1

    if problems:
        print(json.dumps({"ok": False, "problems": problems}, ensure_ascii=False, indent=1))
        sys.exit(1)

    # Step 8: derived fields
    for name, entry in entries.items():
        # codex
        if "codex" not in entry["explicit"]:
            if entry["norm"][0] in codex_by_norm:
                entry["codex"] = codex_by_norm[entry["norm"][0]]
            else:
                entry["codex"] = codex_default
        # processing
        if "processing" not in entry["explicit"]:
            if entry["norm"][0] is not None and entry["norm"][0] in processing_by_norm:
                entry["processing"] = processing_by_norm[entry["norm"][0]]
            elif entry["norm"][0] is None:
                entry["processing"] = processing_by_diet.get(entry["diet"], processing_default)
            else:
                entry["processing"] = processing_default
        # dry
        if "dry_matter" not in entry["explicit"]:
            if entry["dry"] is None and entry["norm"][0] in dry_by_norm:
                entry["dry"] = dry_by_norm[entry["norm"][0]]

    # Step 9: dry_null
    for name in dry_null:
        if name in entries:
            entries[name]["dry"] = None

    # Step 10: synonyms
    for name, entry in entries.items():
        final_syns = []
        seen = set()
        # Add synonyms first
        for s in entry["synonyms"]:
            w = words_of(s)
            if entry["split"]:
                pass
            else:
                w = core_words(w, mods)
            if not w:
                continue
            syn = " ".join(w)
            if key_of(w) not in seen:  # один ключ §2.2 — один синоним записи
                seen.add(key_of(w))
                final_syns.append(syn)
        # Add name_ru last
        w = words_of(entry["name_ru"])
        if entry["split"]:
            pass
        else:
            w = core_words(w, mods)
        if w:
            syn = " ".join(w)
            if key_of(w) not in seen:  # один ключ §2.2 — один синоним записи
                seen.add(key_of(w))
                final_syns.append(syn)
        entry["syns"] = final_syns

    # Step 11: collisions
    auto_merged = []
    while True:
        key_map = {}
        for name, entry in entries.items():
            for syn in entry["syns"]:
                k = key_of(syn.split(" "))
                if k not in key_map:
                    key_map[k] = []
                if name not in key_map[k]:
                    key_map[k].append(name)
        
        collision_found = False
        for k, names in key_map.items():
            if len(names) < 2:
                continue
            # Check if all entries have the same tuple
            tuples = []
            for n in names:
                e = entries[n]
                t = (e["norm"][0], e["norm"][1], tuple(e.get("codex", [])), e["diet"], e["base"], tuple(e.get("processing", [])), e["dry"])
                tuples.append(t)
            
            if all(t == tuples[0] for t in tuples):
                # Merge later entries into the first one
                first = names[0]
                for later in names[1:]:
                    if later in entries:
                        # Append syns that are not yet present
                        for syn in entries[later]["syns"]:
                            if key_of(syn.split(" ")) not in {key_of(x.split(" ")) for x in entries[first]["syns"]}:
                                entries[first]["syns"].append(syn)
                        del entries[later]
                        auto_merged.append({"from": later, "to": first, "key": k})
                        collision_found = True
            else:
                # Collision with different tuples
                desc = "; ".join(f"{n}={tuples[i]}" for i, n in enumerate(names))
                problems.append(f"collision {k}: {desc}")
        
        if not collision_found:
            break

    if problems:
        print(json.dumps({"ok": False, "problems": problems}, ensure_ascii=False, indent=1))
        sys.exit(1)

    # Step 12: ids
    id_pattern = re.compile(r"^[a-z0-9_]+$")
    seen_ids = set()
    for name, entry in entries.items():
        eid = entry.get("id")
        if eid is None:
            problems.append(f"missing id for {name}")
            continue
        if not id_pattern.match(eid):
            problems.append(f"invalid id: {eid}")
        if eid in seen_ids:
            problems.append(f"duplicate id: {eid}")
        seen_ids.add(eid)

    if problems:
        print(json.dumps({"ok": False, "problems": problems}, ensure_ascii=False, indent=1))
        sys.exit(1)

    # Step 13: transfer — явные ключи КП записи: части item_ru (через «,» и «:») по целым словам без модификаторов;
    # синоним входит в часть (вид в перечне группы КП) или первая часть входит в синоним («малина» → «малина лесная»)
    app = [r for r in transfer_records if r.get("quantity") in ("Tag", "KP") and r.get("unit_norm") == "m2/kg"]
    def item_parts(item_ru):
        parts = [set(core_words(words_of(x), mods)) for x in re.split(r"[,:]", str(item_ru))]
        return [x for x in parts if x]
    def gets(entry, parts):
        for syn in entry["syns"]:
            sw = set(core_words(syn.split(" "), mods))
            if sw and (any(sw <= pw for pw in parts) or (parts and parts[0] <= sw)):
                return True
        return False
    unassigned = set()
    for entry in entries.values():
        entry["transfer"] = sorted({r["item_ru"] for r in app if gets(entry, item_parts(r["item_ru"]))})
    for r in app:
        if not any(gets(e, item_parts(r["item_ru"])) for e in entries.values()):
            unassigned.add(str(r["item_ru"]).split(",")[0].strip())
    unassigned = sorted(unassigned)

    # Step 14: states
    for name, entry in entries.items():
        if entry["norm"][0] and str(entry["norm"][0]).startswith("t044_water_"):
            entry["states"] = ["fresh"]
        else:
            entry["states"] = ["fresh", "dried", "cooked"]

    # Output
    j = lambda v: json.dumps(v, ensure_ascii=False)
    lines = []
    lines.append("# products.yaml — единый словарь продуктов (#FR-85, D-024): название продукта → строка норматива, класс Codex/EU, группа рациона, обработка, коэффициенты перехода, сухое вещество.")
    lines.append("# Получен tools/fr85_make_products.py из data-src/products.draft.yaml по решениям tools/fr85_decisions.yaml; дальше правится руками. Схема записи — audit/fr85-products-dict-spec.md §1.")
    lines.append("# kind: modifier — слова состояния продукта (§1.1); kind: product — продукт. null и [] — явное «нет»; отсутствие поля — ошибка валидатора (tools/products_check.py).")
    
    for m in MODIFIERS:
        lines.append(f"- {{id: {m['id']}, kind: modifier, state: {m['state']}, words: {j(m['words'])}}}")
    
    lines.append("")
    
    # Sort products by normalize_name
    sorted_entries = sorted(entries.values(), key=lambda e: normalize_name(e["name_ru"]))
    
    for entry in sorted_entries:
        lines.append(f"- id: {entry['id']}")
        lines.append("  kind: product")
        lines.append(f"  name_ru: {j(entry['name_ru'])}")
        lines.append(f"  synonyms: {j(entry['syns'])}")
        lines.append(f"  states: {j(entry['states'])}")
        lines.append(f"  modifiers_change_product: {'true' if entry['split'] else 'false'}")
        lines.append(f"  norm: {{fresh: {j(entry['norm'][0])}, dried: {j(entry['norm'][1])}}}")
        lines.append(f"  codex: {j(entry.get('codex', []))}")
        lines.append(f"  diet: {{group: {j(entry['diet'])}, base: {'true' if entry['base'] else 'false'}, factor: null}}")
        lines.append(f"  processing: {j(entry.get('processing', []))}")
        if entry.get("transfer"):
            lines.append("  transfer:")
            for item in entry["transfer"]:
                lines.append(f"    - {j(item)}")
        else:
            lines.append("  transfer: []")
        lines.append(f"  dry_matter: {j(entry.get('dry'))}")
        lines.append(f"  note: {j(entry.get('why', ''))}")
        lines.append(f"  decided: {j(entry.get('decided'))}")
    
    out_text = "\n".join(lines) + "\n"
    
    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(out_text)

    # Self-check
    records = yaml.safe_load(out_text)
    others = {}
    for name in ("limits_ru", "diet", "processing", "transfer"):
        p = data_dir / f"{name}.json"
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                others[name] = json.load(f).get("records", [])
        else:
            others[name] = []
    
    errs = []
    check_products("products", records, others, errs)
    if errs:
        print(json.dumps({"ok": False, "validator": errs}, ensure_ascii=False, indent=1))
        sys.exit(1)

    # Summary
    total_synonyms = sum(len(e["syns"]) for e in entries.values())
    with_norm = sum(1 for e in entries.values() if e["norm"][0] is not None)
    with_transfer = sum(1 for e in entries.values() if e.get("transfer"))
    
    summary = {
        "ok": True,
        "draft": draft_count,
        "excluded": excluded_count,
        "merged": merged,
        "auto_merged": auto_merged,
        "added": added_count,
        "products": len(entries),
        "synonyms": total_synonyms,
        "with_norm": with_norm,
        "with_transfer": with_transfer,
        "rule_applied": rule_applied,
        "unassigned_transfer": unassigned
    }
    
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    
    if args.report:
        with open(args.report, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(summary, ensure_ascii=False, indent=1) + "\n")

if __name__ == "__main__":
    main()
