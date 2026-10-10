import sys
import json
import pathlib
import argparse
import yaml

sys.stdout.reconfigure(encoding='utf-8')

ALLOWED_SET_KEYS = {
    'name_ru', 'synonyms', 'hidden_synonyms', 'states', 'modifiers_change_product',
    'norm', 'codex', 'diet', 'processing', 'transfer', 'dry_matter', 'note',
    'decided', 'options', 'words', 'stopwords', 'forms', 'neutral', 'generic', 'blockers', 'regroup', 'intervention', 'caption'
}

PRODUCT_KEYS = [
    'id', 'kind', 'name_ru', 'synonyms', 'states', 'modifiers_change_product',
    'norm', 'codex', 'diet', 'processing', 'transfer', 'dry_matter', 'note', 'decided'
]


def J(x):
    return json.dumps(x, ensure_ascii=False)


def emit(header_lines, records):
    lines = []
    for h in header_lines:
        lines.append(h)

    non_products = []
    products = []
    for r in records:
        if r.get('kind') == 'product':
            products.append(r)
        else:
            non_products.append(r)

    for r in non_products:
        kind = r.get('kind')
        if kind == 'modifier':
            line = f"- {{id: {r['id']}, kind: modifier, state: {r['state']}, words: {J(r['words'])}}}"
        elif kind == 'lexicon':
            line = f"- {{id: {r['id']}, kind: lexicon, stopwords: {J(r['stopwords'])}, forms: {J(r['forms'])}"
            for extra in ('neutral', 'generic', 'blockers', 'regroup'):  # #FR-85 v12, v13, v14
                if extra in r:
                    line += f", {extra}: {J(r[extra])}"
            line += "}"
        elif kind == 'choice':
            line = f"- {{id: {r['id']}, kind: choice, name_ru: {J(r['name_ru'])}, synonyms: {J(r['synonyms'])}, options: {J(r['options'])}, note: {J(r['note'])}}}"
        else:
            raise ValueError(f"unknown kind: {kind}")
        lines.append(line)

    if non_products and products:
        lines.append("")

    for r in products:
        lines.append(f"- id: {r['id']}")
        lines.append("  kind: product")
        lines.append(f"  name_ru: {J(r['name_ru'])}")
        lines.append(f"  synonyms: {J(r['synonyms'])}")
        if 'hidden_synonyms' in r:
            lines.append(f"  hidden_synonyms: {J(r['hidden_synonyms'])}")
        lines.append(f"  states: {J(r['states'])}")
        lines.append(f"  modifiers_change_product: {str(r['modifiers_change_product']).lower()}")
        lines.append(f"  norm: {{fresh: {J(r['norm']['fresh'])}, dried: {J(r['norm']['dried'])}}}")
        lines.append(f"  codex: {J(r['codex'])}")
        lines.append(f"  diet: {{group: {J(r['diet']['group'])}, base: {str(r['diet']['base']).lower()}, factor: {J(r['diet']['factor'])}}}")
        lines.append(f"  processing: {J(r['processing'])}")
        if r['transfer']:
            lines.append("  transfer:")
            for item in r['transfer']:
                lines.append(f"    - {J(item)}")
        else:
            lines.append("  transfer: []")
        lines.append(f"  dry_matter: {J(r['dry_matter'])}")
        lines.append(f"  note: {J(r['note'])}")
        lines.append(f"  decided: {J(r['decided'])}")
        if 'caption' in r:  # #FR-85 v17: подпись к названию (показывается в вердикте, отчёте и печати)
            lines.append(f"  caption: {J(r['caption'])}")
        if 'intervention' in r:  # #FR-85 v14: вода нецентрализованного водоснабжения — уровни вмешательства НРБ-99/2009 Прил. 2а
            lines.append(f"  intervention: {J(r['intervention'])}")

    return "\n".join(lines) + "\n"


def apply(records, ops):
    for i, op in enumerate(ops):
        if not isinstance(op, dict) or 'op' not in op:
            raise ValueError("missing 'op'")
        if 'why' not in op or not isinstance(op['why'], str) or not op['why']:
            raise ValueError("missing or empty 'why'")

        op_type = op['op']

        if op_type == 'set':
            id_val = op.get('id')
            if id_val is None:
                raise ValueError("missing 'id'")
            rec = next((r for r in records if r.get('id') == id_val), None)
            if rec is None:
                raise ValueError(f"unknown id: {id_val}")
            fields = op.get('fields', {})
            if not isinstance(fields, dict):
                raise ValueError("'fields' must be a dict")
            for k, v in fields.items():
                if k not in ALLOWED_SET_KEYS:
                    raise ValueError(f"disallowed key: {k}")
                rec[k] = v

        elif op_type == 'add_synonyms':
            id_val = op.get('id')
            if id_val is None:
                raise ValueError("missing 'id'")
            rec = next((r for r in records if r.get('id') == id_val), None)
            if rec is None:
                raise ValueError(f"unknown id: {id_val}")
            items = op.get('items', [])
            if not isinstance(items, list):
                raise ValueError("'items' must be a list")
            for item in items:
                if item not in rec['synonyms']:
                    rec['synonyms'].append(item)

        elif op_type == 'remove_synonyms':
            id_val = op.get('id')
            if id_val is None:
                raise ValueError("missing 'id'")
            rec = next((r for r in records if r.get('id') == id_val), None)
            if rec is None:
                raise ValueError(f"unknown id: {id_val}")
            items = op.get('items', [])
            if not isinstance(items, list):
                raise ValueError("'items' must be a list")
            for item in items:
                if item not in rec['synonyms']:
                    raise ValueError(f"synonym not found: {item}")
                rec['synonyms'].remove(item)
                if 'hidden_synonyms' in rec and item in rec['hidden_synonyms']:
                    rec['hidden_synonyms'].remove(item)

        elif op_type == 'hide_synonyms':
            id_val = op.get('id')
            if id_val is None:
                raise ValueError("missing 'id'")
            rec = next((r for r in records if r.get('id') == id_val), None)
            if rec is None:
                raise ValueError(f"unknown id: {id_val}")
            items = op.get('items', [])
            if not isinstance(items, list):
                raise ValueError("'items' must be a list")
            for item in items:
                if item not in rec['synonyms']:
                    raise ValueError(f"synonym not in synonyms: {item}")
                if 'hidden_synonyms' not in rec:
                    rec['hidden_synonyms'] = []
                if item not in rec['hidden_synonyms']:
                    rec['hidden_synonyms'].append(item)

        elif op_type == 'add_transfer':
            id_val = op.get('id')
            if id_val is None:
                raise ValueError("missing 'id'")
            rec = next((r for r in records if r.get('id') == id_val), None)
            if rec is None:
                raise ValueError(f"unknown id: {id_val}")
            items = op.get('items', [])
            if not isinstance(items, list):
                raise ValueError("'items' must be a list")
            for item in items:
                if item not in rec['transfer']:
                    rec['transfer'].append(item)

        elif op_type == 'remove_transfer':
            id_val = op.get('id')
            if id_val is None:
                raise ValueError("missing 'id'")
            rec = next((r for r in records if r.get('id') == id_val), None)
            if rec is None:
                raise ValueError(f"unknown id: {id_val}")
            items = op.get('items', [])
            if not isinstance(items, list):
                raise ValueError("'items' must be a list")
            for item in items:
                if item not in rec['transfer']:
                    raise ValueError(f"transfer item not found: {item}")
                rec['transfer'].remove(item)

        elif op_type == 'merge':
            into_id = op.get('into')
            if into_id is None:
                raise ValueError("missing 'into'")
            from_ids = op.get('from', [])
            if not isinstance(from_ids, list):
                raise ValueError("'from' must be a list")

            into_rec = next((r for r in records if r.get('id') == into_id), None)
            if into_rec is None:
                raise ValueError(f"unknown id: {into_id}")
            if into_rec.get('kind') != 'product':
                raise ValueError(f"record {into_id} is not a product")

            sources = []
            for fid in from_ids:
                src = next((r for r in records if r.get('id') == fid), None)
                if src is None:
                    raise ValueError(f"unknown id: {fid}")
                if src.get('kind') != 'product':
                    raise ValueError(f"record {fid} is not a product")
                sources.append(src)

            for src in sources:
                for syn in src.get('synonyms', []):
                    if syn not in into_rec['synonyms']:
                        into_rec['synonyms'].append(syn)
                if 'hidden_synonyms' in src:
                    if 'hidden_synonyms' not in into_rec:
                        into_rec['hidden_synonyms'] = []
                    for syn in src['hidden_synonyms']:
                        if syn not in into_rec['hidden_synonyms']:
                            into_rec['hidden_synonyms'].append(syn)
                for t in src.get('transfer', []):
                    if t not in into_rec['transfer']:
                        into_rec['transfer'].append(t)
                for p in src.get('processing', []):
                    if p not in into_rec['processing']:
                        into_rec['processing'].append(p)

            for src in sources:
                records.remove(src)

        elif op_type == 'new':
            rec = op.get('record')
            if not isinstance(rec, dict):
                raise ValueError("'record' must be a dict")
            if 'id' not in rec or 'kind' not in rec:
                raise ValueError("record must have 'id' and 'kind'")
            if any(r.get('id') == rec['id'] for r in records):
                raise ValueError(f"duplicate id: {rec['id']}")

            if rec['kind'] == 'product':
                for k in PRODUCT_KEYS:
                    if k not in rec:
                        raise ValueError(f"product record missing key: {k}")

            non_products = [r for r in records if r.get('kind') != 'product']
            products = [r for r in records if r.get('kind') == 'product']

            if rec['kind'] != 'product':
                new_records = non_products + [rec] + products
            else:
                def sort_key(r):
                    return r['name_ru'].lower().replace('ё', 'е')

                new_key = sort_key(rec)
                insert_idx = len(products)
                for idx, p in enumerate(products):
                    if sort_key(p) > new_key:
                        insert_idx = idx
                        break
                new_products = products[:insert_idx] + [rec] + products[insert_idx:]
                new_records = non_products + new_products

            records.clear()
            records.extend(new_records)

        elif op_type == 'delete':
            id_val = op.get('id')
            if id_val is None:
                raise ValueError("missing 'id'")
            rec = next((r for r in records if r.get('id') == id_val), None)
            if rec is None:
                raise ValueError(f"unknown id: {id_val}")
            records.remove(rec)

        else:
            raise ValueError(f"unknown op: {op_type}")

    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('patch_file')
    parser.add_argument('--out', default=None)
    args = parser.parse_args()

    repo = pathlib.Path(__file__).resolve().parent.parent
    src_path = repo / 'data-src' / 'products.yaml'
    out_path = pathlib.Path(args.out) if args.out else src_path

    try:
        with open(src_path, 'r', encoding='utf-8', newline='\n') as f:
            text = f.read()
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"0: failed to read source: {e}"}, ensure_ascii=False))
        return 1

    header_lines = []
    for line in text.split('\n'):
        if line.startswith('#'):
            header_lines.append(line)
        else:
            break

    try:
        records = yaml.safe_load(text)
        if not isinstance(records, list):
            raise ValueError("root must be a list")
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"0: failed to parse YAML: {e}"}, ensure_ascii=False))
        return 1

    try:
        with open(args.patch_file, 'r', encoding='utf-8', newline='\n') as f:
            patch = json.load(f)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"0: failed to read patch: {e}"}, ensure_ascii=False))
        return 1

    if not isinstance(patch, dict) or 'ops' not in patch:
        print(json.dumps({"ok": False, "error": "0: patch must be an object with 'ops'"}, ensure_ascii=False))
        return 1

    ops = patch['ops']
    if not isinstance(ops, list):
        print(json.dumps({"ok": False, "error": "0: 'ops' must be a list"}, ensure_ascii=False))
        return 1

    try:
        records = apply(records, ops)
    except ValueError as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        return 1

    try:
        output_text = emit(header_lines, records)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"emit error: {e}"}, ensure_ascii=False))
        return 1

    try:
        with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(output_text)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"failed to write output: {e}"}, ensure_ascii=False))
        return 1

    products = [r for r in records if r.get('kind') == 'product']
    non_products = [r for r in records if r.get('kind') != 'product']

    result = {
        "ok": True,
        "ops": len(ops),
        "records": len(records),
        "products": len(products),
        "non_products": len(non_products),
        "out": str(out_path)
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
