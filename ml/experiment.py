#!/usr/bin/env python3
"""Compare prompt variants (taxonomy files) on the labeled dataset.

    .venv/bin/python experiment.py ../data/Датасет-ДСС variants/a.json variants/b.json [--max-side 1280]

For each variant: runs worker.py (no Kafka, cached), then prints
accuracy, defect recall, kind accuracy, and the safe auto share — the largest
share of frames closed without people while still missing zero defects — with
its margin (gap between the least confident real "ok" auto-closed and the most
"ok"-looking defect). A bigger margin means the threshold will hold on new photos.
"""
from __future__ import annotations

import argparse
import csv
import json
import pathlib
import subprocess
import sys

import labels as lab

ROOT = pathlib.Path(__file__).resolve().parent


def metrics(run: pathlib.Path, labels: dict, tax: dict) -> dict:
    classes = tax["classes"]
    preds = [json.loads(l) for l in (run / "predictions.jsonl").read_text().splitlines() if l.strip()]
    refs = {lab.file_key(r["file"]) + "|" + pathlib.PurePosixPath(r["file"]).parent.name.lower() for r in tax.get("references", [])}
    is_ref = lambda p: lab.file_key(p["rel"]) + "|" + pathlib.PurePosixPath(p["rel"]).parent.name.lower() in refs
    rows = [(labels[lab.path_key(p["rel"])], p) for p in preds
            if lab.path_key(p.get("rel", "")) in labels and p["route"] != "error" and not is_ref(p)]
    n = len(rows)
    acc = sum(l["class"] == p["top"] for l, p in rows) / n
    kind = sum(l["kind"] == p["kind"] for l, p in rows) / n
    # P(ok) as the model's top answer; the auto rule only closes frames whose top class is ok.
    ok_p = lambda p: p["top_p"] if p["top"] and classes[p["top"]]["ok"] else 0.0
    worst_defect = max((ok_p(p) for l, p in rows if not classes[l["class"]]["ok"]), default=0.0)
    oks = sorted((ok_p(p) for l, p in rows if classes[l["class"]]["ok"]), reverse=True)
    safe = [v for v in oks if v > worst_defect]
    per = {}
    for l, p in rows:
        c = per.setdefault(l["class"], [0, 0])
        c[0] += l["class"] == p["top"]
        c[1] += 1
    return {
        "acc": acc, "kind": kind, "safe_auto": len(safe) / n,
        "margin": (min(safe) - worst_defect) if safe else 0.0, "worst_defect_ok_p": worst_defect,
        "per_class": {k: f"{a}/{b}" for k, (a, b) in per.items()},
        "n": n,
        "cost": json.loads((run / "summary.json").read_text())["cost_usd"],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dataset", type=pathlib.Path)
    ap.add_argument("variants", nargs="+", type=pathlib.Path)
    ap.add_argument("--max-side", type=int, default=1280)
    ap.add_argument("--images", type=pathlib.Path, help="photos to run on (default: dataset), e.g. crops")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()
    lab_path = args.dataset / "labels.csv"
    labels = {lab.path_key(r["file"]): r for r in csv.DictReader(open(lab_path, encoding="utf-8"))}

    for v in args.variants:
        run_id = f"exp-{v.stem}-{args.max_side}{args.tag}"
        subprocess.run([sys.executable, str(ROOT / "worker.py"), str(args.images or args.dataset), "--labels", str(lab_path),
                        "--id-col", "object_id", "--kafka", "", "--taxonomy", str(v), "--max-side", str(args.max_side),
                        "--run-id", run_id], check=True, stdout=subprocess.DEVNULL)
        m = metrics(ROOT / "runs" / run_id, labels, json.loads(v.read_text()))
        print(f"{v.stem + args.tag:18} side={args.max_side:<5} acc={m['acc']:.1%} kind={m['kind']:.1%} "
              f"safe_auto={m['safe_auto']:.1%} margin={m['margin']:.2f} worst_defect_ok={m['worst_defect_ok_p']:.2f} "
              f"n={m['n']} ${m['cost']:.4f} {m['per_class']}", flush=True)


if __name__ == "__main__":
    main()
