#!/usr/bin/env python3
"""Quality report of a worker run against the organizers' annotation.

    .venv/bin/python evaluate.py runs/<run_id> --labels ../data/labels.xlsx --file-col file --label-col defect
    # label values are matched to taxonomy classes by key, Russian label or aliases;
    # anything else: --map "Трещина крышки=broken_cover" (repeatable)

Writes report.json (read by the API page «Качество модели»), report.md, confusion.csv, mistakes.csv.
"""
from __future__ import annotations

import argparse
import csv
import json
import pathlib
from collections import Counter, defaultdict

import decision as dec
import labels as lab


def norm(s: str) -> str:
    return " ".join(str(s).lower().replace("ё", "е").split())


def build_mapper(tax: dict, extra: list[str]):
    m = {}
    for key, c in tax["classes"].items():
        for v in [key, c["label"], *c.get("aliases", [])]:
            m[norm(v)] = key
    for pair in extra:
        v, _, key = pair.rpartition("=")
        if key not in tax["classes"]:
            raise SystemExit(f"--map {pair!r}: unknown class {key!r}")
        m[norm(v)] = key
    return lambda v: m.get(norm(v))


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run", type=pathlib.Path)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--sheet")
    ap.add_argument("--file-col", default="file")
    ap.add_argument("--label-col", required=True, help="column with the defect type")
    ap.add_argument("--status-col", help="optional: organizers' status column, cross-tabbed with our routes")
    ap.add_argument("--kind-col", help="optional: true object kind (taxonomy kind key) → kind accuracy")
    ap.add_argument("--desc-col", help="optional: organizers' damage description, shown next to mistakes")
    ap.add_argument("--map", action="append", default=[], help='"label value=class_key"')
    ap.add_argument("--taxonomy", default=str(dec.ROOT / "taxonomy.json"))
    args = ap.parse_args()

    tax = dec.load_taxonomy(args.taxonomy)
    classes = tax["classes"]
    to_class = build_mapper(tax, args.map)
    rows = lab.index_by_file(lab.read_table(args.labels, args.sheet), args.file_col)
    if rows and args.label_col not in next(iter(rows.values())):
        raise SystemExit(f"column '{args.label_col}' not found")
    preds = [json.loads(l) for l in (args.run / "predictions.jsonl").read_text().splitlines() if l.strip()]
    summary = json.loads((args.run / "summary.json").read_text()) if (args.run / "summary.json").exists() else {}

    no_label, unmapped, errors = 0, Counter(), 0
    pairs = []  # (truth, pred_top, rec)
    kind_pairs = []  # (true kind, predicted kind)
    status_x = defaultdict(Counter)
    for rec in preds:
        row = lab.lookup(rows, rec.get("rel"), rec["file"])
        if row is None:
            no_label += 1
            continue
        if args.status_col:
            status_x[row.get(args.status_col, "")][rec["route"]] += 1
        if rec["route"] == "error":
            errors += 1
            continue
        truth = to_class(row[args.label_col])
        if truth is None:
            unmapped[row[args.label_col]] += 1
            continue
        rec["_truth_desc"] = row.get(args.desc_col, "") if args.desc_col else ""
        if args.kind_col and row.get(args.kind_col):
            kind_pairs.append((row[args.kind_col], rec.get("kind")))
        pairs.append((truth, rec["top"], rec))

    n = len(pairs)
    keys = list(classes)
    conf = {t: Counter() for t in keys}
    for t, p, _ in pairs:
        conf[t][p] += 1
    per_class = {}
    for k in keys:
        tp = conf[k][k]
        fp = sum(conf[t][k] for t in keys if t != k)
        fn = sum(conf[k][p] for p in keys if p != k)
        p_, r_, f_ = prf(tp, fp, fn)
        if tp + fp + fn:
            per_class[k] = {"label": classes[k]["label"], "support": tp + fn, "precision": round(p_, 3), "recall": round(r_, 3), "f1": round(f_, 3)}
    accuracy = sum(1 for t, p, _ in pairs if t == p) / n if n else 0.0
    supported = [v for v in per_class.values() if v["support"]]
    macro_f1 = sum(v["f1"] for v in supported) / len(supported) if supported else 0.0

    # Safety view: did a real defect reach a human?
    flagged = lambda r: r["route"] in ("review", "critical")
    defects = [(t, r) for t, _, r in pairs if not classes[t]["ok"]]
    oks = [(t, r) for t, _, r in pairs if classes[t]["ok"]]
    caught = sum(1 for _, r in defects if flagged(r))
    missed = [(t, r) for t, r in defects if not flagged(r)]
    false_alarm = sum(1 for _, r in oks if flagged(r))
    auto = [(t, r) for t, _, r in pairs if r["route"] == "auto_ok"]
    auto_correct = sum(1 for t, _ in auto if classes[t]["ok"])
    to_humans = sum(1 for _, _, r in pairs if flagged(r))

    # Threshold sweep: replay the routing rule with different auto_ok values.
    sweep = []
    for auto_ok in [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.01]:
        th = {**tax["thresholds"], "auto_ok": auto_ok}
        routes = [dec.choose_route(r["top"], r["top_p"], r["object_p"], r["p_critical"], r["severity"], classes, th, r.get("checks"))
                  for _, _, r in pairs]
        fl = [rt in ("review", "critical") for rt in routes]
        miss = sum(1 for (t, _, _), f in zip(pairs, fl) if not classes[t]["ok"] and not f)
        sweep.append({
            "auto_ok": auto_ok,
            "auto_share": round(sum(rt == "auto_ok" for rt in routes) / n, 4) if n else 0.0,
            "to_humans_share": round(sum(fl) / n, 4) if n else 0.0,
            "defects_missed": miss,
            "defect_recall": round(1 - miss / len(defects), 4) if defects else None,
        })

    report = {
        "run_id": args.run.name,
        "evaluated": n,
        "images": len(preds),
        "no_label": no_label,
        "api_errors": errors,
        "unmapped_labels": dict(unmapped),
        "accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f1, 4),
        "defect_recall": round(caught / len(defects), 4) if defects else None,
        "false_alarm_rate": round(false_alarm / len(oks), 4) if oks else None,
        "defects_total": len(defects),
        "defects_missed": len(missed),
        "auto_share": round(len(auto) / n, 4) if n else 0.0,
        "auto_precision": round(auto_correct / len(auto), 4) if auto else None,
        "to_humans_share": round(to_humans / n, 4) if n else 0.0,
        "routes": dict(Counter(r["route"] for _, _, r in pairs)),
        "per_class": per_class,
        "threshold_sweep": sweep,
        "confusion": {"labels": keys, "names": [classes[k]["label"] for k in keys], "matrix": [[conf[t][p] for p in keys] for t in keys]},
        "missed_examples": [
            {"file": r.get("rel") or r["file"], "truth": classes[t]["label"], "truth_desc": r.get("_truth_desc", ""), "predicted": classes[r["top"]]["label"] if r["top"] else None,
             "route": r["route"], "media_uri": r.get("media_uri"), "object_id": r.get("object_id")}
            for t, r in missed[:30]
        ],
        "kind_accuracy": round(sum(a == b for a, b in kind_pairs) / len(kind_pairs), 4) if kind_pairs else None,
        "kind_confusion": {f"{a}→{b}": c for (a, b), c in Counter(kind_pairs).items()} if kind_pairs else None,
        "status_vs_route": {s: dict(c) for s, c in status_x.items()} if args.status_col else None,
        "cost_usd": summary.get("cost_usd"),
        "wall_s": summary.get("wall_s"),
        "avg_latency_s": summary.get("avg_latency_s"),
        "model": summary.get("model"),
        "thresholds": summary.get("thresholds", tax["thresholds"]),
    }
    (args.run / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))

    with open(args.run / "confusion.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["истина \\ модель", *[classes[k]["label"] for k in keys]])
        for t in keys:
            w.writerow([classes[t]["label"], *[conf[t][p] for p in keys]])
    with open(args.run / "mistakes.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["file", "truth", "truth_desc", "predicted", "p", "route", "rationale"])
        for t, p, r in pairs:
            if t != p:
                w.writerow([r.get("rel") or r["file"], classes[t]["label"], r.get("_truth_desc", ""), classes[p]["label"] if p else "", f"{r['top_p']:.2f}", r["route"], r["rationale"]])

    pct = lambda v: "—" if v is None else f"{v * 100:.1f}%"
    md = [
        f"# Качество модели · прогон {args.run.name}",
        "",
        f"- Оценено: **{n}** из {len(preds)} фото (без разметки {no_label}, ошибок API {errors}, нераспознанных меток {sum(unmapped.values())})",
        f"- Точность по виду дефекта: **{pct(accuracy)}**, macro-F1 {macro_f1:.3f}",
        f"- Дефекты дошли до человека: **{pct(report['defect_recall'])}** ({caught} из {len(defects)}), пропущено {len(missed)}",
        f"- Ложные тревоги на норме: {pct(report['false_alarm_rate'])}",
        *([f"- Тип объекта определён верно: {pct(report['kind_accuracy'])} {report['kind_confusion']}"] if kind_pairs else []),
        f"- Решено автоматически: **{pct(report['auto_share'])}**, из них верно {pct(report['auto_precision'])}",
        f"- Ушло людям: {pct(report['to_humans_share'])}",
        f"- Стоимость всего датасета ${summary.get('cost_usd', 0)} (${summary.get('cost_usd', 0) / max(1, len(preds)):.5f} за фото), "
        f"модель отвечает в среднем за {summary.get('avg_latency_s', '?')} с",
        "",
        "| Класс | Фото | Precision | Recall | F1 |",
        "|---|---:|---:|---:|---:|",
        *[f"| {v['label']} | {v['support']} | {v['precision']:.2f} | {v['recall'] if v['support'] else '—'} | {v['f1']:.2f} |" for v in per_class.values()],
        "",
        "Порог автоподтверждения нормы (auto_ok) → сколько решено без людей и сколько дефектов пропущено:",
        "",
        "| auto_ok | Автоматически | Людям | Пропущено дефектов |",
        "|---:|---:|---:|---:|",
        *[f"| {w['auto_ok']} | {pct(w['auto_share'])} | {pct(w['to_humans_share'])} | {w['defects_missed']} |" for w in sweep],
    ]
    if unmapped:
        md += ["", "Нераспознанные метки (добавить в aliases или --map):", *[f"- `{k}` × {c}" for k, c in unmapped.most_common()]]
    (args.run / "report.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
