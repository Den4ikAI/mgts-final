#!/usr/bin/env python3
"""Streaming worker: Kafka `frames.ingested` → photo from S3 → Gemini Decision →
`frames.analyzed` (every frame) + `detections.created` (frames for the registry).

    .venv/bin/python consumer.py                 # runs until Ctrl+C
    .venv/bin/python consumer.py --from-start    # also re-process old uploads (new consumer group)

Env: KAFKA_BROKERS (localhost:19092), S3_ENDPOINT (http://localhost:8333),
S3_ACCESS_KEY / S3_SECRET_KEY (mgts / mgts-secret), OPENROUTER_API_KEY (or ../.env).
Answers are cached by photo hash, so re-uploading a photo costs nothing.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import io
import json
import os
import pathlib
import signal
import time
import uuid
from urllib.parse import unquote, urlparse

import decision as dec
from events import NS, detection_payload, envelope

FRAMES, ANALYZED, DETECTIONS = "frames.ingested", "frames.analyzed", "detections.created"


def s3_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT", "http://localhost:8333"),
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY", "mgts"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY", "mgts-secret"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 5}),
    )


def fetch(uri: str, s3) -> bytes:
    u = urlparse(uri)
    if u.scheme == "s3":
        return s3.get_object(Bucket=u.netloc, Key=u.path.lstrip("/"))["Body"].read()
    if u.scheme == "file":
        return pathlib.Path(unquote(u.path)).read_bytes()
    raise ValueError(f"unsupported image_uri {uri!r}")


def exif_position(raw: bytes) -> dict | None:
    """GPS from EXIF, if the camera wrote it."""
    try:
        from PIL import Image

        gps = Image.open(io.BytesIO(raw)).getexif().get_ifd(0x8825)
        if not gps or 2 not in gps or 4 not in gps:
            return None
        deg = lambda t: float(t[0]) + float(t[1]) / 60 + float(t[2]) / 3600
        lat = deg(gps[2]) * (-1 if gps.get(1) == "S" else 1)
        lon = deg(gps[4]) * (-1 if gps.get(3) == "W" else 1)
        if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat, lon) != (0.0, 0.0):
            return {"lat": round(lat, 6), "lon": round(lon, 6)}
    except Exception:
        pass
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kafka", default=os.environ.get("KAFKA_BROKERS", "localhost:19092"))
    ap.add_argument("--group", default="ml-decision")
    ap.add_argument("--from-start", action="store_true", help="fresh consumer group: re-read the whole topic")
    ap.add_argument("--taxonomy", default=str(dec.ROOT / "taxonomy.json"))
    ap.add_argument("--max-side", type=int, default=2048)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    from confluent_kafka import Consumer, Producer

    tax = dec.load_taxonomy(args.taxonomy)
    kinds = tax["kind_question"]["classes"]
    client = dec.Client(tax, max_side=args.max_side)
    s3 = s3_client()
    group = f"{args.group}-{int(time.time())}" if args.from_start else args.group
    consumer = Consumer({
        "bootstrap.servers": args.kafka, "group.id": group, "auto.offset.reset": "earliest",
        # Commit only after a batch is answered: a crash re-processes, never drops (ids are deterministic).
        "enable.auto.commit": False,
    })
    consumer.subscribe([FRAMES])
    producer = Producer({"bootstrap.servers": args.kafka, "enable.idempotence": True, "linger.ms": 5})
    print(f"listening {FRAMES} · group {group} · model {dec.MODEL} · questions {client.qhash}", flush=True)

    def handle(ev: dict) -> None:
        f = ev["payload"]
        frame_id = f["frame_id"]
        t0 = time.monotonic()
        out = {"frame_id": frame_id, "route": "error", "object_kind": None, "defect_type": None, "severity": None,
               "confidence": 0.0, "top_class": None, "top_p": None, "probs": None, "rationale": None, "detection_id": None, "object_id": f.get("object_id"),
               "position": f.get("position"), "model": dec.MODEL, "latency_ms": None, "error": None}
        try:
            raw = fetch(f["image_uri"], s3)
            sha = f.get("sha256") or hashlib.sha256(raw).hexdigest()
            res, cached, _ = client.ask(pathlib.Path(f.get("file_name") or "upload.jpg"), sha, raw)
            rec = dec.as_dict(dec.interpret(res, tax))
            position = f.get("position") or exif_position(raw)
            object_id = f.get("object_id") or f"ФОТО-{sha[:8]}"
            out.update(route=rec["route"], object_kind=rec["kind"] if rec["kind"] in kinds else None,
                       defect_type=rec["defect_type"], severity=rec["severity"],
                       confidence=round(float(rec["probs"].get(rec["defect_type"], rec["top_p"]) if rec["defect_type"] else rec["top_p"]), 4),
                       top_class=rec["top"], top_p=round(float(rec["top_p"]), 4),
                       probs={k: round(float(v), 4) for k, v in rec["probs"].items()},
                       rationale=rec["rationale"], object_id=object_id, position=position)
            if rec["route"] in ("auto_ok", "review", "critical"):
                det_id = str(uuid.uuid5(NS, f"det:{frame_id}:{client.qhash}"))
                payload = detection_payload(rec, detection_id=det_id, frame_id=frame_id, object_id=object_id,
                                            kinds=kinds, position=position, crop_uri=f.get("media_uri"))
                producer.produce(DETECTIONS, key=frame_id, value=envelope(frame_id, payload))
                out["detection_id"] = det_id
        except dec.FatalApiError as e:
            out["error"] = f"model API: {e}"[:300]
        except Exception as e:  # the uploader must still get an answer
            out["error"] = f"{type(e).__name__}: {e}"[:300]
        out["latency_ms"] = int((time.monotonic() - t0) * 1000)
        producer.produce(ANALYZED, key=frame_id, value=envelope(frame_id, out))
        producer.poll(0)
        label = tax["classes"].get(out["defect_type"] or "", {}).get("label", "норма")
        print(f"  {frame_id} {out['route']:12} {label:24} {out['latency_ms']:5} ms · {f.get('file_name')}"
              + (f" · {out['error']}" if out["error"] else ""), flush=True)

    stop = False

    def on_signal(*_):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    with cf.ThreadPoolExecutor(args.workers) as pool:
        while not stop:
            msgs = consumer.consume(num_messages=args.workers * 2, timeout=0.5)
            batch = []
            for m in msgs:
                if m.error():
                    print("kafka:", m.error(), flush=True)
                    continue
                try:
                    batch.append(json.loads(m.value()))
                except ValueError:
                    continue
            list(pool.map(handle, batch))
            if msgs:
                producer.flush(10)
                consumer.commit(asynchronous=False)
            producer.poll(0)
    producer.flush(10)
    consumer.close()


if __name__ == "__main__":
    main()
