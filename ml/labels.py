"""Reads the organizers' annotation table (CSV / TSV / XLSX) and matches rows to image files."""
from __future__ import annotations

import csv
import pathlib


def read_table(path: str | pathlib.Path, sheet: str | None = None) -> list[dict]:
    p = pathlib.Path(path)
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        from openpyxl import load_workbook

        wb = load_workbook(p, read_only=True, data_only=True)
        ws = wb[sheet] if sheet else wb.active
        rows = ws.iter_rows(values_only=True)
        header = [str(h).strip() if h is not None else f"col{i}" for i, h in enumerate(next(rows))]
        return [
            {h: ("" if v is None else str(v).strip()) for h, v in zip(header, r)}
            for r in rows if any(v is not None for v in r)
        ]
    text = p.read_text(encoding="utf-8-sig")
    dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(text.splitlines(), dialect=dialect)]


def file_key(name: str) -> str:
    """Match by basename without extension, case-insensitive: 'img/001.JPG' == '001.jpg' == '001'."""
    return pathlib.PurePath(name.replace("\\", "/")).stem.lower()


def index_by_file(rows: list[dict], file_col: str) -> dict[str, dict]:
    if rows and file_col not in rows[0]:
        raise SystemExit(f"column '{file_col}' not in table; columns: {list(rows[0])}")
    return {file_key(r[file_col]): r for r in rows if r.get(file_col)}


def describe(path: str | pathlib.Path, sheet: str | None = None) -> None:
    """Quick look at an unknown table: columns and value counts."""
    rows = read_table(path, sheet)
    print(f"{len(rows)} rows")
    for col in rows[0] if rows else []:
        vals = [r[col] for r in rows]
        uniq = sorted(set(vals))
        sample = ", ".join(uniq[:12]) + (" …" if len(uniq) > 12 else "")
        print(f"- {col!r}: {len(uniq)} distinct · {sample}")


if __name__ == "__main__":
    import sys

    describe(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
