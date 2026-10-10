"""#FR-81 V05: записывает таблицу дожития и доли причин (вывод `tools/risks_lifetime_calc.py --export-table`) в data-src/life_risks.yaml между маркерами; запуск: python tools/life_table_to_yaml.py <export.json>."""

import json
import pathlib
import sys
import yaml

sys.stdout.reconfigure(encoding='utf-8')

BEGIN = "# >>> life_table: сгенерировано tools/life_table_to_yaml.py из tools/risks_lifetime_calc.py --export-table (#FR-81 V05); руками не править"
END = "# <<< life_table"

LABELS = {
    "1000": "Умереть от любой причины",
    "1064": "Умереть от болезней системы кровообращения (I00–I99)",
    "1026": "Умереть от новообразований (рака и других опухолей, C00–D48)",
    "1034": "Умереть от рака лёгкого (трахеи, бронхов, лёгкого, C33–C34)",
    "1095": "Умереть от внешних причин",
    "1096": "Умереть в дорожно-транспортном происшествии",
    "1097": "Умереть от падения",
    "1098": "Утонуть",
    "1099": "Умереть от огня (пожара)",
    "1100": "Умереть от случайного отравления",
    "1101": "Умереть от самоубийства",
    "1102": "Умереть от убийства",
}

def format_number(n):
    return f"{n:,}".replace(",", " ")


def build_records(ex, rosstat_1098):
    records = []

    # First record: life table
    lt_record = {
        "id": "lt_ru_2019",
        "kind": "life_table",
        "label_ru": "Таблица дожития lx, Россия, 2019 (мужчины и женщины раздельно)",
        "year": ex["year"],
        "source": "ROSSTAT_DEMOG2023",
        "loc": "Росстат, Демографический ежегодник 2023, табл. 5.3, с. 82 (PDF 83): число доживающих до возраста x из 100 000 родившихся; число родившихся по полу — табл. 2.2",
        "quote": "lx на узлах 0, 1, 2, 3, 4, 5, 10, …, 85: рождение 100 000; 20: М 98 724, Ж 99 127; 70: М 51 678, Ж 78 418 (2019)",
        "method": "экспорт tools/risks_lifetime_calc.py --export-table; между узлами l(x) — линейная интерполяция (решение заказчика D-022, допущение), за узлом 85 — l = 0 (группа 85+ закрывается нулём)",
        "nodes": ex["nodes"],
        "lx": ex["lx"],
        "births": ex["births"],
        "groups": ex["groups"],
        "level": "✅",
    }
    records.append(lt_record)

    # EXTRA: только то, что подтверждено: пометка по 1026 (Д1) и сверка 1098 с Росстатом
    extra = {"1026": {"note": "Код ВОЗ только злокачественных новообразований (C00–C97) в наличии не найден (Д1 спецификации): экспортирован 1026 = C00–D48, подпись «новообразования (рака и других опухолей)». Код 1027 — не итог по злокачественным."},
             "1098": {"rosstat_check": rosstat_1098}}

    # Then one record per code in ex["deaths"]
    for code in ex["deaths"]:
        male_sum = sum(ex["deaths"][code]["male"])
        female_sum = sum(ex["deaths"][code]["female"])
        total = male_sum + female_sum

        quote_str = f"ВОЗ {code}: М {format_number(male_sum)} + Ж {format_number(female_sum)} = {format_number(total)} смертей в 2019 в возрастных группах (без графы «возраст не указан»)"

        rec = {
            "id": "cs_" + code,
            "kind": "cause_shares",
            "code": code,
            "label_ru": LABELS[code],
            "year": ex["year"],
            "source": "ROSSTAT_DEMOG2023",
            "source_also": ["WHO_MORTDB"],
            "loc": f"ВОЗ, база смертности, Россия 2019, код списка 101: {code}; возрастные группы 0, 1–4, 5–9, …, 80–84, 85+; lx — запись lt_ru_2019",
            "quote": quote_str,
            "method": "доля причины в смертях возрастной группы = умершие от причины / умершие от всех причин (код 1000) по тому же полу и группе; вероятность — Σ доля × убыль lx (см. src/calc/life_table.js)",
        }

        # Insert extras from EXTRA dict after method, before deaths
        if code in extra:
            for k, v in extra[code].items():
                rec[k] = v

        rec["deaths"] = ex["deaths"][code]
        rec["share"] = ex["share"][code]
        rec["level"] = "✅"

        records.append(rec)

    return records


def main():
    if len(sys.argv) < 2:
        print("Использование: python tools/life_table_to_yaml.py <export.json> [yaml_path] [rosstat_1098]", file=sys.stderr)
        sys.exit(1)

    export_path = pathlib.Path(sys.argv[1])
    yaml_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else (pathlib.Path(__file__).resolve().parent.parent / 'data-src' / 'life_risks.yaml')
    rosstat_1098 = sys.argv[3] if len(sys.argv) > 3 else "не сверено"

    with open(export_path, 'r', encoding='utf-8') as f:
        ex = json.load(f)

    records = build_records(ex, rosstat_1098)

    dump_str = yaml.safe_dump(records, allow_unicode=True, sort_keys=False, width=10**9, default_flow_style=None)
    if not dump_str.endswith('\n'):
        dump_str += '\n'

    # Read existing yaml file if it exists
    if yaml_path.exists():
        with open(yaml_path, 'r', encoding='utf-8', newline='') as f:
            content = f.read()
    else:
        content = ""

    # Detect line ending
    use_crlf = "\r\n" in content

    # Build the block to insert
    block = BEGIN + "\n" + dump_str + END + "\n"
    if use_crlf:
        block = block.replace("\n", "\r\n")

    # Check if BEGIN and END markers exist
    if BEGIN in content and END in content:
        # Find the indices
        begin_idx = content.index(BEGIN)
        end_idx = content.index(END, begin_idx) + len(END)

        # Ensure we replace up to the end of the END line
        # Find the newline after END
        if end_idx < len(content) and content[end_idx] == '\n':
            end_idx += 1
        elif end_idx < len(content) and content[end_idx:end_idx+2] == '\r\n':
            end_idx += 2

        new_content = content[:begin_idx] + block + content[end_idx:]
    else:
        # Append to the end
        if content and not content.endswith('\n'):
            if use_crlf:
                content += '\r\n'
            else:
                content += '\n'
        new_content = content + block

    # Write back
    with open(yaml_path, 'w', encoding='utf-8', newline='') as f:
        f.write(new_content)

    print(f"записано записей: {len(records)}")


if __name__ == "__main__":
    main()
