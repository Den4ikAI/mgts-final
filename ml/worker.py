#!/usr/bin/env python3
"""Batch run over a dataset folder: Gemini Decision -> routing -> Kafka `detections.created`.

    .venv/bin/python worker.py ../data/photos --labels ../data/labels.xlsx --file-col file --id-col object_id

Writes runs/<run_id>/predictions.jsonl and summary.json. Responses are cached
per image + question set, so a re-run after a crash or a threshold change is
free and instant. Detection ids are deterministic, so re-publishing does not
duplicate anything in the backend.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import pathlib
import sys
import time
import uuid

import decision as dec
import labels as lab

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
NS = uuid.UUID("6f1c2a52-3a8e-4f39-9d0a-6d2b1d0b7a11")  # namespace for deterministic ids


def sha256(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def num(v: str | None) -> float | None:
    try:
        return float(str(v).replace(",", ".")) if v not in (None, "") else None
    except ValueError:
        return None


def envelope(key: str, payload: dict) -> bytes:
    return json.dumps({
        "event_id": str(uuid.uuid4()),
        "occurred_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "key": key,
        "source": "ml.decision-worker",
        "payload": payload,
    }, ensure_ascii=False).encode()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", type=pathlib.Path, help="folder with photos (searched recursively)")
    ap.add_argument("--media-root", type=pathlib.Path, help="folder the API serves at /api/media = its MEDIA_ROOT (default: images)")
    ap.add_argument("--labels", help="annotation table (csv/xlsx) for object ids / coordinates")
    ap.add_argument("--sheet")
    ap.add_argument("--file-col", default="file")
    ap.add_argument("--id-col", help="column with registry object id (default: IMG-<file name>)")
    ap.add_argument("--lat-col")
    ap.add_argument("--lon-col")
    ap.add_argument("--taxonomy", default=str(dec.ROOT / "taxonomy.json"))
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-side", type=int, default=1280, help="downscale longest side (0 = send original)")
    ap.add_argument("--limit", type=int, default=0, help="only first N images (dry runs)")
    ap.add_argument("--run-id", default=dt.datetime.now().strftime("%Y%m%d-%H%M%S"))
    ap.add_argument("--kafka", default="localhost:19092", help="brokers; '' = do not publish")
    args = ap.parse_args()

    tax = dec.load_taxonomy(args.taxonomy)
    files = sorted(p for p in args.images.rglob("*") if p.suffix.lower() in IMAGE_EXT and p.is_file())
    if args.limit:
        files = files[: args.limit]
    if not files:
        sys.exit(f"no images under {args.images}")
    media_root = (args.media_root or args.images).resolve()
    rows = lab.index_by_file(lab.read_table(args.labels, args.sheet), args.file_col) if args.labels else {}

    out = dec.ROOT / "runs" / args.run_id
    out.mkdir(parents=True, exist_ok=True)
    client = dec.Client(tax, max_side=args.max_side)

    producer = None
    if args.kafka:
        from confluent_kafka import Producer

        producer = Producer({"bootstrap.servers": args.kafka, "enable.idempotence": True, "linger.ms": 20})

    print(f"{len(files)} images · model {dec.MODEL} · questions {client.qhash} · run {args.run_id}", flush=True)

    def work(p: pathlib.Path) -> dict:
        sha = sha256(p)
        rec = {"file": p.name, "path": str(p), "sha256": sha}
        try:
            res, cached, latency = client.ask(p, sha)
            d = dec.interpret(res, tax)
            full = float((res.get("usage") or {}).get("cost", 0.0))
            rec.update(dec.as_dict(d), cached=cached, latency=round(latency, 3),
                       cost=full, spent=0.0 if cached else full)
        except dec.FatalApiError:
            raise
        except Exception as e:  # keep going; the report lists failures
            rec.update(route="error", error=str(e)[:300])
        return rec

    t0 = time.monotonic()
    done, counts, cost, spent, published, latencies = 0, {}, 0.0, 0.0, 0, []
    with open(out / "predictions.jsonl", "w") as f, cf.ThreadPoolExecutor(args.workers) as ex:
        futures = {ex.submit(work, p): p for p in files}
        try:
            for fut in cf.as_completed(futures):
                rec = fut.result()
                p = futures[fut]
                row = rows.get(lab.file_key(p.name), {})
                rec["object_id"] = (row.get(args.id_col) if args.id_col else None) or f"IMG-{p.stem}"
                lat, lon = num(row.get(args.lat_col)) if args.lat_col else None, num(row.get(args.lon_col)) if args.lon_col else None
                try:
                    rec["media_uri"] = "/api/media/" + p.resolve().relative_to(media_root).as_posix()
                except ValueError:
                    rec["media_uri"] = None

                if producer and rec["route"] in ("auto_ok", "review", "critical"):
                    frame_id = uuid.uuid5(NS, "frame:" + rec["sha256"])
                    det_id = uuid.uuid5(NS, f"det:{rec['sha256']}:{client.qhash}:{json.dumps(tax['thresholds'], sort_keys=True)}")
                    conf = rec["probs"].get(rec["defect_type"], rec["top_p"]) if rec["defect_type"] else rec["top_p"]
                    payload = {
                        "detection_id": str(det_id),
                        "frame_id": str(frame_id),
                        "object_id": rec["object_id"],
                        "object_kind": rec["kind"] if rec["kind"] in ("cable_well", "dual_pole") else "cable_well",
                        "position": {"lat": lat, "lon": lon} if lat is not None and lon is not None else None,
                        "defect_type": rec["defect_type"],
                        "severity": rec["severity"],
                        "confidence": round(float(conf), 4),
                        "bbox": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
                        "crop_uri": rec["media_uri"],
                        "rationale": rec["rationale"],
                    }
                    producer.produce("detections.created", key=str(frame_id), value=envelope(str(frame_id), payload))
                    producer.poll(0)
                    published += 1

                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                done += 1
                counts[rec["route"]] = counts.get(rec["route"], 0) + 1
                cost += rec.get("cost") or 0.0
                spent += rec.get("spent") or 0.0
                if rec.get("latency"):
                    latencies.append(rec["latency"])
                if done % 25 == 0 or done == len(files):
                    el = time.monotonic() - t0
                    print(f"  {done}/{len(files)} · {el:.0f}s · spent ${spent:.4f} · {counts}", flush=True)
        except dec.FatalApiError as e:
            for fu in futures:
                fu.cancel()
            sys.exit(f"stopped: {e}")

    if producer:
        left = producer.flush(30)
        if left:
            print(f"WARNING: {left} Kafka messages not delivered", file=sys.stderr)

    summary = {
        "run_id": args.run_id, "images": len(files), "routes": counts,
        "cost_usd": round(cost, 5), "spent_usd": round(spent, 5), "wall_s": round(time.monotonic() - t0, 1),
        "avg_latency_s": round(sum(latencies) / len(latencies), 2) if latencies else None, "workers": args.workers, "model": dec.MODEL, "questions_hash": client.qhash,
        "thresholds": tax["thresholds"], "published": published, "images_dir": str(args.images.resolve()),
    }
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"→ {out}")


if __name__ == "__main__":
    main()
