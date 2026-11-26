#!/usr/bin/env python3
"""Second stage: every cabinet / board in the frame with its own box and condition.

    .venv/bin/python boxes.py                # alongside consumer.py; runs until Ctrl+C

Kafka `frames.ingested` (own consumer group, so it never delays the verdict) → photo
from S3 → Gemini 4 Hydrogen (list of objects, box_2d) → `frames.objects`.
Rate-limited to stay under OpenRouter's 20 requests/min for new accounts
(BOXES_RPM, default 18). Answers cached by photo hash in .cache/boxes-llm/.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import pathlib
import signal
import threading
import time

import decision as dec
import multibox
from consumer import fetch, s3_client
from events import envelope

FRAMES, OBJECTS = "frames.ingested", "frames.objects"


class RateLimit:
    """At most `rpm` calls per rolling minute, shared by all threads."""

    def __init__(self, rpm: int):
        self.rpm, self.calls, self.lock = rpm, [], threading.Lock()

    def wait(self) -> None:
        while True:
            with self.lock:
                now = time.monotonic()
                self.calls = [t for t in self.calls if now - t < 60]
                if len(self.calls) < self.rpm:
                    self.calls.append(now)
                    return
                sleep = 60 - (now - self.calls[0]) + 0.05
            time.sleep(sleep)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kafka", default=os.environ.get("KAFKA_BROKERS", "localhost:19092"))
    ap.add_argument("--group", default="ml-boxes")
    ap.add_argument("--from-start", action="store_true", help="fresh consumer group: re-read the whole topic")
    ap.add_argument("--model", default=os.environ.get("BOXES_MODEL", "google/gemini-4-hydrogen"))
    ap.add_argument("--effort", default="low")
    ap.add_argument("--rpm", type=int, default=int(os.environ.get("BOXES_RPM", "18")))
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    from confluent_kafka import Consumer, Producer

    tax = dec.load_taxonomy()
    conditions = {k for k in tax["classes"] if k != "none"}
    kinds = set(tax["kind_question"]["classes"])
    qh = hashlib.sha256(json.dumps([args.model, args.effort, tax["classes"], tax["kind_question"]], sort_keys=True).encode()).hexdigest()[:12]
    cache = dec.ROOT / ".cache" / "boxes-llm" / qh
    cache.mkdir(parents=True, exist_ok=True)
    limit = RateLimit(args.rpm)
    s3 = s3_client()
    group = f"{args.group}-{int(time.time())}" if args.from_start else args.group
    consumer = Consumer({"bootstrap.servers": args.kafka, "group.id": group, "auto.offset.reset": "earliest",
                         "enable.auto.commit": False})
    consumer.subscribe([FRAMES])
    producer = Producer({"bootstrap.servers": args.kafka, "enable.idempotence": True, "linger.ms": 5})
    print(f"listening {FRAMES} · group {group} · {args.model} · ≤{args.rpm} req/min", flush=True)

    def handle(ev: dict) -> None:
        f = ev["payload"]
        frame_id = f["frame_id"]
        t0 = time.monotonic()
        out = {"frame_id": frame_id, "objects": [], "model": args.model, "latency_ms": None, "error": None}
        try:
            raw = fetch(f["image_uri"], s3)
            sha = f.get("sha256") or hashlib.sha256(raw).hexdigest()
            c = cache / f"{sha}.json"
            if c.exists():
                res = json.loads(c.read_text())
            else:
                limit.wait()
                res, _, _ = multibox.ask(pathlib.Path(f.get("file_name") or "upload.jpg"), args.model, args.effort, tax, raw)
                c.write_text(json.dumps(res, ensure_ascii=False))
            for o in res.get("objects", []):
                bbox = multibox.to_bbox(o.get("box_2d", []))
                if bbox is None or o.get("condition") not in conditions:
                    continue
                out["objects"].append({
                    "bbox": bbox,
                    "kind": o.get("kind") if o.get("kind") in kinds else None,
                    "condition": o["condition"],
                    "confidence": round(float(o.get("confidence", 0.0)), 3),
                    "note": (o.get("note_ru") or "")[:300] or None,
                })
        except Exception as e:  # the frame still gets an (empty) answer
            out["error"] = f"{type(e).__name__}: {e}"[:300]
        out["latency_ms"] = int((time.monotonic() - t0) * 1000)
        producer.produce(OBJECTS, key=frame_id, value=envelope(frame_id, out, source="ml.boxes"))
        producer.poll(0)
        objs = ", ".join(f"{o['kind'] or '?'}:{o['condition']}" for o in out["objects"]) or "—"
        print(f"  {frame_id} {len(out['objects'])} obj [{objs}] {out['latency_ms']} ms"
              + (f" · {out['error']}" if out["error"] else ""), flush=True)

    stop = False

    def on_signal(*_):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    with cf.ThreadPoolExecutor(args.workers) as pool:
        while not stop:
            msgs = consumer.consume(num_messages=args.workers, timeout=0.5)
            batch = [json.loads(m.value()) for m in msgs if not m.error()]
            list(pool.map(handle, batch))
            if msgs:
                producer.flush(10)
                consumer.commit(asynchronous=False)
    producer.flush(10)
    consumer.close()


if __name__ == "__main__":
    main()
