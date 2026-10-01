"""Probe data-src/*.yaml: top-level layout, record keys, value types, enum-like values. JSON to stdout."""
import sys, json, glob, os, collections, yaml
sys.stdout.reconfigure(encoding='utf-8')
root = os.path.join(os.path.dirname(__file__), '..', 'data-src')
out = {}
for p in sorted(glob.glob(os.path.join(root, '*.yaml'))):
    d = yaml.safe_load(open(p, encoding='utf-8'))
    top = {k: type(v).__name__ for k, v in d.items()} if isinstance(d, dict) else type(d).__name__
    recs = next((v for v in (d.values() if isinstance(d, dict) else [d]) if isinstance(v, list) and v and isinstance(v[0], dict)), [])
    keys, types, vals = collections.Counter(), collections.defaultdict(set), collections.defaultdict(collections.Counter)
    for r in recs:
        for k, v in r.items():
            keys[k] += 1; types[k].add(type(v).__name__)
            if isinstance(v, str) and len(v) < 40: vals[k][v] += 1
    enums = {k: dict(c.most_common(12)) for k, c in vals.items() if len(c) <= 25}
    out[os.path.basename(p)] = {'top': top, 'n': len(recs), 'keys': {k: [n, sorted(types[k])] for k, n in keys.items()}, 'enums': enums}
print(json.dumps(out, ensure_ascii=False, indent=1))
