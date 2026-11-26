#!/usr/bin/env python3
"""Every cabinet / board on the photo with its own box and condition (Gemini 4, chat API).

    .venv/bin/python multibox.py <photo> [out.jpg] [--model google/gemini-4-hydrogen]

Jev's `box` question returns exactly one box; this asks a vision LLM for a list.
Boxes: box_2d = [ymin, xmin, ymax, xmax] in 0..1000 (Gemini's native convention).
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import pathlib
import random
import time
import urllib.error
import urllib.request

import decision as dec

URL = "https://openrouter.ai/api/v1/chat/completions"


def ask(path: pathlib.Path, model: str, effort: str, tax: dict, raw: bytes | None = None) -> tuple[dict, float, float]:
    """Returns (answer, latency_s, cost_usd). Retries 429 / 5xx / network; `raw` = bytes from S3."""
    classes = list(tax["classes"])
    kinds = list(tax["kind_question"]["classes"])
    cls = "\n".join(f"- {k}: {c['description']}" for k, c in tax["classes"].items() if k != "none")
    prompt = f"""{tax['context']}

Find EVERY telecom equipment cabinet and electrical distribution board in the photo (not only the main one), including ones that are open, hanging or fallen.
For each give a tight bounding box box_2d = [ymin, xmin, ymax, xmax] normalized to 0..1000, its kind, and its condition:
{cls}
Kinds: tksh = large climate cabinet with louvers / AC unit; rsh = small flat distribution board with one door.
Answer JSON only."""
    schema = {"type": "json_schema", "json_schema": {"name": "objects", "strict": True, "schema": {
        "type": "object", "additionalProperties": False, "required": ["objects"],
        "properties": {"objects": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["box_2d", "kind", "condition", "confidence", "note_ru"],
            "properties": {
                "box_2d": {"type": "array", "items": {"type": "integer"}},
                "kind": {"type": "string", "enum": kinds},
                "condition": {"type": "string", "enum": [c for c in classes if c != "none"]},
                "confidence": {"type": "number"},
                "note_ru": {"type": "string"},
            }}}}}}}
    img, mime = dec.image_bytes(path, 2048, raw)
    body = {"model": model, "reasoning": {"effort": effort}, "response_format": schema, "messages": [{"role": "user", "content": [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(img).decode()}"}}]}]}
    data = json.dumps(body).encode()
    delay = 2.0
    for attempt in range(10):
        req = urllib.request.Request(URL, data=data, headers={"Authorization": f"Bearer {dec.api_key()}", "Content-Type": "application/json"})
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                res = json.load(r)
            return json.loads(res["choices"][0]["message"]["content"]), time.monotonic() - t0, (res.get("usage") or {}).get("cost", 0.0)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            if e.code in (400, 401, 402, 403, 404):
                raise dec.FatalApiError(f"HTTP {e.code}: {msg}") from None
            err = f"HTTP {e.code}: {msg}"
            if e.code == 429:  # new accounts: 20 requests/min per model
                delay = max(delay, 15.0)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = f"network: {e}"
        time.sleep(delay + random.random() * 3)
        delay = min(delay * 2, 30)
    raise RuntimeError(err)


def to_bbox(box_2d: list) -> dict | None:
    """Gemini's [ymin, xmin, ymax, xmax] in 0..1000 → {x, y, w, h} in 0..1 (top-left + size)."""
    if len(box_2d) != 4:
        return None
    y0, x0, y1, x1 = (min(1000, max(0, int(v))) / 1000 for v in box_2d)
    if x1 <= x0 or y1 <= y0:
        return None
    return {"x": round(x0, 4), "y": round(y0, 4), "w": round(x1 - x0, 4), "h": round(y1 - y0, 4)}


def draw(path: pathlib.Path, objs: list[dict], tax: dict, out: pathlib.Path) -> None:
    from PIL import Image, ImageDraw, ImageOps

    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    W, H = im.size
    d = ImageDraw.Draw(im)
    color = {"ok": (60, 200, 120), "paint": (240, 180, 40), "deformation": (255, 120, 40), "mount_failure": (240, 50, 50)}
    for o in objs:
        y0, x0, y1, x1 = (v / 1000 for v in o["box_2d"])
        c = color.get(o["condition"], (200, 200, 200))
        w = max(3, W // 250)
        d.rectangle([x0 * W, y0 * H, x1 * W, y1 * H], outline=c, width=w)
        label = f"{tax['kind_question']['labels'].get(o['kind'], o['kind'])} · {tax['classes'][o['condition']]['label']}"
        d.rectangle([x0 * W, y0 * H - W // 40, x0 * W + len(label) * W // 90, y0 * H], fill=c)
    im.thumbnail((900, 900))
    im.save(out, quality=88)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photo", type=pathlib.Path)
    ap.add_argument("out", nargs="?", type=pathlib.Path)
    ap.add_argument("--model", default="google/gemini-4-hydrogen")
    ap.add_argument("--effort", default="low")
    args = ap.parse_args()
    tax = dec.load_taxonomy()
    res, dt, cost = ask(args.photo, args.model, args.effort, tax)
    print(f"{args.model} · {dt:.1f} s · ${cost:.4f}")
    for o in res["objects"]:
        print(f"  {o['kind']:4} {o['condition']:13} {o['confidence']:.2f} {o['box_2d']} · {o['note_ru']}")
    if args.out:
        draw(args.photo, res["objects"], tax, args.out)
        print("→", args.out)


if __name__ == "__main__":
    main()
