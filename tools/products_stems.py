"""Правила словаря продуктов на уровне основ Snowball (#FR-85 v11): токены как в src/calc/products.js, проверки PROD_DUP_STEM/PROD_CHOICE/PROD_HIDDEN/PROD_LEXICON, выгрузка пар слово→основа для сверки с JS."""
import sys
import json
import pathlib
import argparse
import snowballstemmer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from products_check import normalize_name, words_of, key_of
from products_lex_check import check_lexicon_extras, check_blockers, check_regroup  # #FR-85 v12: neutral / generic

_STEMMER = snowballstemmer.stemmer('russian')


def stem_ru(word):
    return _STEMMER.stemWord(str(word))


def lexicon_of(records):
    for r in records:
        if r.get('kind') == 'lexicon':
            stop = set()
            if isinstance(r.get('stopwords'), list):
                for w in r['stopwords']:
                    if w:
                        stop.add(normalize_name(w))
            forms = {}
            if isinstance(r.get('forms'), dict):
                for k, v in r['forms'].items():
                    forms[normalize_name(k)] = v
            return stop, forms
    return set(), {}


def tokens_of(text, stop, forms):
    return [forms[w] if w in forms else stem_ru(w) for w in words_of(text) if w not in stop]


def check_stems(ds, records, errors):
    products = {r['id']: r for r in records if r.get('kind') == 'product'}
    choices = [r for r in records if r.get('kind') == 'choice']
    lexicons = [r for r in records if r.get('kind') == 'lexicon']

    # PROD_LEXICON
    if len(lexicons) > 1:
        errors.append(f"{ds}|-|PROD_LEXICON|more than one lexicon record")
    for lex in lexicons:
        lex_id = lex.get('id', '-')
        # Check stopwords
        sw = lex.get('stopwords')
        if not isinstance(sw, list):
            errors.append(f"{ds}|{lex_id}|PROD_LEXICON|stopwords must be a list")
        else:
            for w in sw:
                if not isinstance(w, str) or not w or normalize_name(w) != w:
                    errors.append(f"{ds}|{lex_id}|PROD_LEXICON|stopword '{w}' is not a normalized non-empty string")
        # Check forms
        fm = lex.get('forms')
        if not isinstance(fm, dict):
            errors.append(f"{ds}|{lex_id}|PROD_LEXICON|forms must be a dict")
        else:
            for k, v in fm.items():
                if not isinstance(k, str) or ' ' in k or normalize_name(k) != k:
                    errors.append(f"{ds}|{lex_id}|PROD_LEXICON|form key '{k}' is not a normalized single word")
                if not isinstance(v, str) or not v:
                    errors.append(f"{ds}|{lex_id}|PROD_LEXICON|form value for '{k}' is not a non-empty string")

    check_lexicon_extras(ds, records, errors, normalize_name, stem_ru)  # PROD_NEUTRAL, PROD_GENERIC
    check_blockers(ds, records, errors, normalize_name)  # PROD_BLOCKERS (v13)
    check_regroup(ds, records, errors, normalize_name)  # PROD_REGROUP (v14)

    # PROD_CHOICE
    for ch in choices:
        ch_id = ch.get('id', '-')
        # name_ru
        if not isinstance(ch.get('name_ru'), str) or not ch['name_ru']:
            errors.append(f"{ds}|{ch_id}|PROD_CHOICE|name_ru must be a non-empty string")
        # synonyms
        syns = ch.get('synonyms')
        if not isinstance(syns, list) or not syns:
            errors.append(f"{ds}|{ch_id}|PROD_CHOICE|synonyms must be a non-empty list")
        else:
            for s in syns:
                if not isinstance(s, str) or not s or normalize_name(s) != s:
                    errors.append(f"{ds}|{ch_id}|PROD_CHOICE|synonym '{s}' is not a normalized non-empty string")
        # options
        opts = ch.get('options')
        if not isinstance(opts, list) or len(opts) < 2:
            errors.append(f"{ds}|{ch_id}|PROD_CHOICE|options must be a list of at least 2 ids")
        else:
            if len(set(opts)) != len(opts):
                errors.append(f"{ds}|{ch_id}|PROD_CHOICE|options must contain distinct ids")
            for oid in opts:
                if oid not in products:
                    errors.append(f"{ds}|{ch_id}|PROD_CHOICE|option id '{oid}' is not an existing product id")
        # note
        if not isinstance(ch.get('note'), str):
            errors.append(f"{ds}|{ch_id}|PROD_CHOICE|note must be a string")

    # PROD_HIDDEN
    for pid, prod in products.items():
        if 'hidden_synonyms' in prod:
            hs = prod['hidden_synonyms']
            if not isinstance(hs, list):
                errors.append(f"{ds}|{pid}|PROD_HIDDEN|hidden_synonyms must be a list")
            else:
                prod_syns = set(prod.get('synonyms', []))
                for h in hs:
                    if h not in prod_syns:
                        errors.append(f"{ds}|{pid}|PROD_HIDDEN|hidden synonym '{h}' is not in synonyms")

    # Prepare for stem checks
    stop, forms = lexicon_of(records)

    # PROD_STOP_ONLY and PROD_DUP_STEM
    owner_by_key = {}
    
    def process_synonym(syn, rec_id):
        toks = tokens_of(syn, stop, forms)
        if not toks:
            errors.append(f"{ds}|{rec_id}|PROD_STOP_ONLY|synonym '{syn}' contains only stop-words")
            return
        k = key_of(toks)
        if k:
            if k not in owner_by_key:
                owner_by_key[k] = set()
            owner_by_key[k].add(rec_id)

    for pid, prod in products.items():
        for syn in prod.get('synonyms', []):
            process_synonym(syn, pid)
    for ch in choices:
        ch_id = ch.get('id', '-')
        for syn in ch.get('synonyms', []):
            process_synonym(syn, ch_id)

    for k, owners in owner_by_key.items():
        if len(owners) > 1:
            errors.append(f"{ds}|-|PROD_DUP_STEM|{k}: " + ",".join(sorted(owners)))


def dump_pairs(records, extra_words):
    stop, forms = lexicon_of(records)
    words_to_check = set()
    
    for r in records:
        if r.get('kind') in ('product', 'choice'):
            for syn in r.get('synonyms', []):
                words_to_check.update(words_of(syn))
        elif r.get('kind') == 'modifier':
            for w in r.get('words', []):
                words_to_check.update(words_of(w))
        elif r.get('kind') == 'lexicon':  # #FR-85 v12: родовые слова — основы нужны и в JS (genericTokens)
            for g in r.get('generic', []):
                for w in g.get('words', []):
                    words_to_check.update(words_of(w))

    if extra_words:
        words_to_check.update(extra_words)

    result = {}
    for w in sorted(words_to_check):
        if w in stop:
            continue
        if w in forms:
            continue
        result[w] = stem_ru(w)

    return {
        "comment": "#FR-85 v11: основы Snowball (Python snowballstemmer) для сверки с JS (snowball-stemmers); генерирует tools/products_stems.py --dump",
        "words": result
    }


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--dump', type=str, help='Path to dump JSON')
    parser.add_argument('--extra', type=str, help='Path to JSON list of extra words')
    args = parser.parse_args()

    repo = pathlib.Path(__file__).resolve().parent.parent
    yaml_path = repo / 'data-src' / 'products.yaml'
    
    import yaml
    with open(yaml_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    
    records = data if isinstance(data, list) else data.get('records', [])
    if not isinstance(records, list):
        records = []

    extra_words = []
    if args.extra:
        with open(args.extra, 'r', encoding='utf-8') as f:
            extra_words = json.load(f)

    if args.dump:
        pairs = dump_pairs(records, extra_words)
        out_path = pathlib.Path(args.dump)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(pairs, ensure_ascii=False, indent=1) + "\n")
        print(json.dumps({"ok": True, "words": len(pairs['words'])}))

    errs = []
    check_stems('products', records, errs)
    if errs:
        print(json.dumps({"ok": False, "errors": errs}, ensure_ascii=False, indent=1))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
