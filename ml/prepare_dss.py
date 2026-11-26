#!/usr/bin/env python3
"""Merges the organizers' per-folder tables («Датасет-ДСС») into one labels.csv.

    .venv/bin/python prepare_dss.py ../data/Датасет-ДСС      # → ../data/Датасет-ДСС/labels.csv

Each folder holds photos plus an xlsx (Имя файла | Статус | Описание). The
object kind (ТКШ / РЩ) is only in the folder name, and file names repeat across
folders, so rows are keyed by the relative path and get a kind-prefixed object id.
"""
from __future__ import annotations

import argparse
import csv
import pathlib

import labels as lab

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def kind_of(folder: str) -> str | None:
    f = folder.upper()
    return "tksh" if "ТКШ" in f else "rsh" if "РЩ" in f else None


def class_of(status: str) -> str | None:
    s = status.lower()
    if "креплен" in s:
        return "mount_failure"
    if "деформац" in s:
        return "deformation"
    if "лкп" in s:
        return "paint"
    if "удовлет" in s:
        return "ok"
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", type=pathlib.Path)
    ap.add_argument("--out", type=pathlib.Path)
    args = ap.parse_args()
    out = args.out or args.root / "labels.csv"

    rows, problems = [], []
    for table in sorted(args.root.rglob("*.xlsx")):
        folder = table.parent
        kind = kind_of(folder.name)
        images = {p.stem.lower(): p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXT}
        seen = set()
        for r in lab.read_table(table):
            name = r["Имя файла"].removesuffix(".0")
            img = images.get(name.lower())
            if img is None:
                problems.append(f"{folder.name}: в таблице {name}, фото нет")
                continue
            seen.add(name.lower())
            cls = class_of(r["Статус"])
            if cls is None:
                problems.append(f"{folder.name}/{name}: статус «{r['Статус']}» без класса")
            rows.append({
                "file": img.relative_to(args.root).as_posix(),
                "object_id": f"{ {'tksh': 'ТКШ', 'rsh': 'РЩ'}.get(kind, 'OBJ') }-{name}",
                "kind": kind or "",
                "class": cls or "",
                "status": " ".join(r["Статус"].split()),
                "description": " ".join(r["Описание"].split()),
                "folder": folder.name,
            })
        problems += [f"{folder.name}/{p.name}: фото без строки в таблице" for k, p in images.items() if k not in seen]

    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    by = {}
    for r in rows:
        by.setdefault((r["kind"], r["class"]), 0)
        by[(r["kind"], r["class"])] += 1
    print(f"{len(rows)} строк → {out}")
    for (k, c), n in sorted(by.items()):
        print(f"  {k:5} {c:14} {n}")
    for p in problems:
        print("  !", p)


if __name__ == "__main__":
    main()
