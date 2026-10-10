#!/usr/bin/env python3
"""
Инструмент проверки цитат (quote) по их локациям (loc) в корпусе.

Корпус лежит вне репозитория, поэтому это утилита (gate), а не юнит-тест.
Проверяет, что текст цитаты действительно встречается в указанных строках
файла корпуса.
"""

import argparse
import os
import re
import sys
from pathlib import Path

import yaml

# Перевод латинских букв, похожих на кириллические, в кириллицу
_LATIN_TO_CYRILLIC = str.maketrans("abcehkmoptxy", "авсенкмортху")

LOC_RE = re.compile(r"^(.+\.md):(\d+)(?:-(\d+))?$")

DEFAULT_CORPUS_DIRS = [
    "библиотека оператора/texts",
    "библиотека оператора/gamma-library",
]


def norm(s: str) -> str:
    """Нормализация строки: нижний регистр, ё->е, латиница->кириллица,
    удаление всех символов вне [0-9а-я]."""
    s = s.lower()
    s = s.replace("ё", "е")
    s = s.translate(_LATIN_TO_CYRILLIC)
    # Удалить все символы, не входящие в [0-9а-я]
    return "".join(ch for ch in s if ch.isascii() and ch.isdigit() or "а" <= ch <= "я")


def load_records(data_dir: Path, source_filter: set | None) -> list[dict]:
    """Рекурсивно обходит YAML-файлы в data_dir и data_dir/transfer.d,
    собирает все dict с ключом 'loc'. Если задан source_filter,
    оставляет только записи с соответствующим 'source'."""
    records = []

    def _walk(node):
        if isinstance(node, dict):
            if "loc" in node:
                rec = dict(node)
                if source_filter is not None:
                    src = rec.get("source")
                    if src not in source_filter:
                        return
                records.append(rec)
            for v in node.values():
                _walk(v)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    search_dirs = [data_dir, data_dir / "transfer.d"]
    for d in search_dirs:
        if not d.is_dir():
            continue
        for yaml_file in sorted(d.glob("*.yaml")):
            try:
                with open(yaml_file, encoding="utf-8") as f:
                    doc = yaml.safe_load(f)
            except Exception:
                continue
            if doc is not None:
                _walk(doc)

    return records


def build_index(corpus_dirs: list[str]) -> dict[str, str]:
    """Строит словарь basename -> полный путь для .md файлов в corpus_dirs.
    Первый найденный файл выигрывает."""
    index: dict[str, str] = {}
    for cdir in corpus_dirs:
        if not os.path.isdir(cdir):
            continue
        for root, _dirs, files in os.walk(cdir):
            for fname in files:
                if fname.endswith(".md"):
                    if fname not in index:
                        index[fname] = os.path.join(root, fname)
    return index


def check_record(record: dict, index: dict[str, str]) -> tuple[str, str]:
    """Проверяет одну запись. Возвращает (status, detail).
    status: OK, SHIFT, LOST, NOFILE, NOQUOTE
    detail: строка локации или пустая строка."""
    loc = record.get("loc", "")
    m = LOC_RE.match(loc)
    if not m:
        return "SKIP", ""

    fname = m.group(1)
    first = int(m.group(2))
    last = int(m.group(3)) if m.group(3) else first

    # Ищем файл в индексе
    if fname not in index:
        return "NOFILE", loc

    fpath = index[fname]
    try:
        with open(fpath, encoding="utf-8") as f:
            lines = f.read().split("\n")
    except Exception:
        return "NOFILE", loc

    # Нормализованные строки всего файла
    norm_lines = [norm(line) for line in lines]
    full_norm = "".join(norm_lines)

    # Окно: строки first-1 .. last+1 (1-based), обрезанные по файлу
    start = max(0, first - 2)  # 0-based index of first-1
    end = min(len(lines), last)  # 0-based index of last+1 exclusive
    window_norm = "".join(norm_lines[start:end])

    # Цитата
    quote = record.get("quote", "")
    if not quote:
        return "NOQUOTE", loc

    # Разбиваем на фрагменты по "[...]"
    fragments = quote.split("[...]")
    keys = []
    for frag in fragments:
        k = norm(frag)[:25]
        if k:
            keys.append(k)

    if not keys:
        return "NOQUOTE", loc

    # Проверяем каждый ключ
    all_in_window = all(k in window_norm for k in keys)
    if all_in_window:
        return "OK", loc

    all_in_file = all(k in full_norm for k in keys)
    if all_in_file:
        return "SHIFT", loc

    return "LOST", loc


def main():
    sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="Проверка цитат по локациям в корпусе."
    )
    default_data_dir = Path(__file__).resolve().parent.parent / "data-src"
    parser.add_argument(
        "data_dir",
        nargs="?",
        default=str(default_data_dir),
        help="Каталог с YAML-данными (по умолчанию: data-src рядом с родительским каталогом скрипта)",
    )
    parser.add_argument(
        "--source",
        action="append",
        default=None,
        help="ID источника (можно повторять); без флага проверяются все",
    )
    parser.add_argument(
        "--corpus-dir",
        action="append",
        default=None,
        help="Каталог с корпусом .md (можно повторять); если не задан, используется LOC_CORPUS_DIRS или значения по умолчанию",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Печатать сводную таблицу по источникам",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    source_filter = set(args.source) if args.source else None

    # Определяем каталоги корпуса
    if args.corpus_dir:
        corpus_dirs = args.corpus_dir
    else:
        env_val = os.environ.get("LOC_CORPUS_DIRS", "")
        if env_val:
            corpus_dirs = env_val.split(os.pathsep)
        else:
            corpus_dirs = DEFAULT_CORPUS_DIRS

    # Загружаем записи
    records = load_records(data_dir, source_filter)

    # Строим индекс корпуса
    index = build_index(corpus_dirs)

    # Проверяем каждую запись
    results = []  # (source, id, loc, status)
    for rec in records:
        status, loc_str = check_record(rec, index)
        if status == "SKIP":
            continue
        source = rec.get("source", "")
        rec_id = rec.get("id", "")
        results.append((source, rec_id, loc_str, status))

    # Считаем
    bad = [r for r in results if r[3] in ("SHIFT", "LOST")]
    nofile = [r for r in results if r[3] == "NOFILE"]
    checked = len(results)

    # Печатаем проблемные записи
    if bad:
        for source, rec_id, loc_str, status in bad:
            print(f"{source}\t{rec_id}\t{loc_str}\t{status}")

    if nofile and not bad:
        for source, rec_id, loc_str, status in nofile:
            print(f"{source}\t{rec_id}\t{loc_str}\t{status}", file=sys.stderr)
        print(
            "Внимание: некоторые файлы корпуса не найдены (корпус вне репозитория).",
            file=sys.stderr,
        )

    # Отчёт
    if args.report:
        # Сводка по источникам
        from collections import defaultdict

        summary = defaultdict(lambda: {"total": 0, "bad": 0, "nofile": 0, "files": set()})
        for source, rec_id, loc_str, status in results:
            s = summary[source]
            s["total"] += 1
            if status in ("SHIFT", "LOST"):
                s["bad"] += 1
            elif status == "NOFILE":
                s["nofile"] += 1
            # Извлекаем имя файла из loc
            m = LOC_RE.match(loc_str)
            if m:
                s["files"].add(m.group(1))

        print(f"{'source':<20} {'corpus file':<40} {'records':>8} {'not-in-loc':>12}")
        print("-" * 84)
        for source in sorted(summary.keys()):
            s = summary[source]
            files_str = ", ".join(sorted(s["files"])) if s["files"] else "-"
            print(f"{source:<20} {files_str:<40} {s['total']:>8} {s['bad']:>12}")

    # Финальная строка
    print(f"checked: {checked}, bad: {len(bad)}, nofile: {len(nofile)}")

    # Код выхода
    if bad:
        sys.exit(1)
    elif nofile:
        sys.exit(2)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
