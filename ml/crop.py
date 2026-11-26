#!/usr/bin/env python3
"""Stage 1: Jev finds the main cabinet / board and the photo is cropped around it.

    .venv/bin/python crop.py ../data/Датасет-ДСС ../data/crops     # same relative paths

Gemini then sees a close-up instead of a whole pole shot from the street. Boxes
are cached in .cache/boxes/<sha>.json and written to <out>/boxes.jsonl, so the UI
can draw them too. Low-confidence boxes are still used, but with a wider margin.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import hashlib
import io
import json
import pathlib
import time
import urllib.error
import urllib.request

from PIL import Image, ImageOps

import decision as dec

MODEL = "typesafe/jev-1.14"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
TARGET = "the main telecom equipment cabinet or electrical distribution board on the pole (the largest and closest one, or the damaged one)"


def jev_image(im: Image.Image) -> bytes:
    """Jev wants JPEG/PNG with each side within 256..1568 px."""
    im = im.copy()
    im.thumbnail((1568, 1568))
    if min(im.size) < 256:
        k = 256 / min(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)))
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=90)
    return buf.getvalue()


def ask_box(data: bytes, key: str) -> dict:
    body = {
        "model": MODEL,
        "state": ["Inspection photo of telecom equipment mounted on a pole.",
                  {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(data).decode()}}],
        "questions": {"where": {"type": "box", "instructions": TARGET}},
    }
    delay = 1.0
    for attempt in range(6):
        req = urllib.request.Request(dec.URL, data=json.dumps(body).encode(),
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 402, 403, 404):
                raise dec.FatalApiError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(delay)
        delay = min(delay * 2, 20)
    raise RuntimeError("jev: retries exhausted")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", type=pathlib.Path)
    ap.add_argument("out", type=pathlib.Path)
    ap.add_argument("--pad", type=float, default=0.15, help="margin around the box, share of its size")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    key = dec.api_key()
    cache = dec.ROOT / ".cache" / "boxes"
    cache.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in args.images.rglob("*") if p.suffix.lower() in IMAGE_EXT and p.is_file())

    def work(p: pathlib.Path) -> dict:
        raw = p.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
        c = cache / f"{sha}.json"
        if c.exists():
            res = json.loads(c.read_text())
        else:
            res = ask_box(jev_image(im), key)
            c.write_text(json.dumps(res))
        ans = res.get("answers", {}).get("where", {})
        b, conf = ans.get("box"), float(ans.get("confidence") or 0.0)
        rel = p.relative_to(args.images)
        dst = (args.out / rel).with_suffix(".jpg")
        dst.parent.mkdir(parents=True, exist_ok=True)
        W, H = im.size
        if b:
            pad = args.pad if conf >= 0.3 else args.pad * 2
            bw, bh = (b["right"] - b["left"]) * W, (b["bottom"] - b["top"]) * H
            # keep at least ~a third of the frame so a tiny wrong box can't lose the object
            bw, bh = max(bw, W / 3), max(bh, H / 3)
            cx, cy = (b["left"] + b["right"]) / 2 * W, (b["top"] + b["bottom"]) / 2 * H
            hw, hh = bw * (0.5 + pad), bh * (0.5 + pad)
            crop = im.crop((max(0, cx - hw), max(0, cy - hh), min(W, cx + hw), min(H, cy + hh)))
        else:
            crop = im
        crop.save(dst, "JPEG", quality=92)
        return {"rel": rel.as_posix(), "box": b, "confidence": conf, "cost": (res.get("usage") or {}).get("cost", 0)}

    with cf.ThreadPoolExecutor(args.workers) as ex:
        recs = list(ex.map(work, files))
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "boxes.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs))
    print(f"{len(recs)} crops → {args.out} · jev ${sum(r['cost'] for r in recs):.5f} · "
          f"low-confidence (<0.3) {sum(r['confidence'] < 0.3 for r in recs)}")


if __name__ == "__main__":
    main()
