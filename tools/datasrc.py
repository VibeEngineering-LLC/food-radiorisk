"""Shared by build_data.py and validate_data.py: YAML parts of a dataset and their combined sha256.
Dataset <stem> = data-src/<stem>.yaml + data-src/<stem>.d/*.yaml (sorted by name), records concatenated in that order."""
import hashlib, pathlib

def parts(src_dir, stem):
    src_dir = pathlib.Path(src_dir); main = src_dir / f"{stem}.yaml"
    return ([main] if main.exists() else []) + sorted((src_dir / f"{stem}.d").glob("*.yaml"))

def combined_sha(paths, src_dir):
    # имя части входит в хеш: переименование/перенос части тоже делает сборку устаревшей
    h = hashlib.sha256()
    for p in paths:
        h.update(pathlib.Path(p).relative_to(src_dir).as_posix().encode("utf-8") + b"\n")
        h.update(pathlib.Path(p).read_bytes())
    return h.hexdigest()
