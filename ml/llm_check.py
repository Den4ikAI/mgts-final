#!/usr/bin/env python3
"""Second opinion from a general vision LLM (chat completions + JSON schema).

    .venv/bin/python llm_check.py ../data/Датасет-ДСС --model google/gemini-4-hydrogen --effort low

Unlike Gemini Decision it gives no real class probabilities (only self-reported
ones), but it writes a Russian description of the damage and reads text burned
into the photo by camera apps (coordinates, address, date). Answers are cached
in .cache/llm/<hash>/<sha>.json; results go to runs/<run_id>/llm.jsonl and are
scored against labels.csv when it exists.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import csv
import hashlib
import json
import pathlib
import random
import time
import urllib.error
import urllib.request

import decision as dec
import labels as lab

URL = "https://openrouter.ai/api/v1/chat/completions"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def build_prompt(tax: dict) -> str:
    cls = "\n".join(f"- {k}: {c['description']}" for k, c in tax["classes"].items())
    kinds = "\n".join(f"- {k}: {d}" for k, d in tax["kind_question"]["classes"].items())
    sev = "\n".join(f"- {i}: {l['description']}" for i, l in enumerate(tax["severity_question"]["levels"]))
    return f"""{tax['context']}

Inspect the main cabinet or board closely: housing walls, door, roof, bottom, climate compartment, mounting brackets.

Condition classes (if several problems, pick the most serious: mount_failure > deformation > paint):
{cls}

Equipment kinds:
{kinds}

Repair urgency levels:
{sev}

Also read any text burned into the photo by a camera app (GPS coordinates, address, date/time). Use null when there is none; never guess coordinates.
Answer in JSON only. Probabilities over condition classes must sum to 1. description_ru: one short sentence in Russian for a field engineer: what is damaged and where."""


def schema(tax: dict) -> dict:
    classes = list(tax["classes"])
    num = {"type": "number"}
    nul = lambda t: {"type": [t, "null"]}
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "inspection", "strict": True,
            "schema": {
                "type": "object", "additionalProperties": False,
                "required": ["kind", "condition", "probabilities", "severity", "description_ru", "overlay"],
                "properties": {
                    "kind": {"type": "string", "enum": list(tax["kind_question"]["classes"])},
                    "condition": {"type": "string", "enum": classes},
                    "probabilities": {"type": "object", "additionalProperties": False, "required": classes,
                                      "properties": {k: num for k in classes}},
                    "severity": {"type": "integer", "enum": list(range(len(tax["severity_question"]["levels"])))},
                    "description_ru": {"type": "string"},
                    "overlay": {"type": "object", "additionalProperties": False,
                                "required": ["lat", "lon", "address", "datetime", "raw_text"],
                                "properties": {"lat": nul("number"), "lon": nul("number"), "address": nul("string"),
                                               "datetime": nul("string"), "raw_text": nul("string")}},
                },
            },
        },
    }


def ask(body: dict, key: str) -> dict:
    data = json.dumps(body).encode()
    delay = 1.0
    for attempt in range(12):
        req = urllib.request.Request(URL, data=data, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                res = json.load(r)
            res["_latency"] = round(time.monotonic() - t0, 3)
            return res
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:400]
            if e.code in (400, 401, 402, 403, 404):
                raise dec.FatalApiError(f"HTTP {e.code}: {msg}") from None
            err = msg
            if e.code == 429:  # new accounts: 20 requests/min per model
                time.sleep(15 + random.random() * 10)
                continue
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = str(e)
        if attempt == 11:
            raise RuntimeError(err)
        time.sleep(delay + random.random())
        delay = min(delay * 2, 30)
    raise AssertionError


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", type=pathlib.Path)
    ap.add_argument("--model", default="google/gemini-4-hydrogen")
    ap.add_argument("--effort", default="low", help="reasoning effort: minimal|low|medium|high")
    ap.add_argument("--taxonomy", default=str(dec.ROOT / "taxonomy.json"))
    ap.add_argument("--max-side", type=int, default=2048)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--labels", help="default: <images>/labels.csv if present")
    ap.add_argument("--run-id")
    args = ap.parse_args()

    tax = dec.load_taxonomy(args.taxonomy)
    prompt, fmt = build_prompt(tax), schema(tax)
    h = hashlib.sha256(json.dumps([args.model, args.effort, prompt, fmt], sort_keys=True).encode()).hexdigest()[:16]
    cache = dec.ROOT / ".cache" / "llm" / f"{h}-s{args.max_side}"
    cache.mkdir(parents=True, exist_ok=True)
    key = dec.api_key()
    files = sorted(p for p in args.images.rglob("*") if p.suffix.lower() in IMAGE_EXT and p.is_file())
    run_id = args.run_id or f"llm-{args.model.split('/')[-1]}-{args.effort}"
    out = dec.ROOT / "runs" / run_id
    out.mkdir(parents=True, exist_ok=True)

    def work(p: pathlib.Path) -> dict:
        sha = hashlib.sha256(p.read_bytes()).hexdigest()
        c = cache / f"{sha}.json"
        if c.exists():
            res = json.loads(c.read_text())
        else:
            img, mime = dec.image_bytes(p, args.max_side)
            res = ask({
                "model": args.model,
                "reasoning": {"effort": args.effort},
                "response_format": fmt,
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(img).decode()}"}},
                ]}],
            }, key)
            c.write_text(json.dumps(res, ensure_ascii=False))
        rec = {"rel": p.relative_to(args.images).as_posix(), "latency": res.get("_latency"),
               "cost": (res.get("usage") or {}).get("cost", 0.0),
               "reasoning_tokens": ((res.get("usage") or {}).get("completion_tokens_details") or {}).get("reasoning_tokens")}
        try:
            rec.update(json.loads(res["choices"][0]["message"]["content"]))
        except Exception as e:
            rec["error"] = f"{type(e).__name__}: {str(res)[:300]}"
        return rec

    t0 = time.monotonic()
    with cf.ThreadPoolExecutor(args.workers) as ex:
        recs = list(ex.map(work, files))
    wall = time.monotonic() - t0
    (out / "llm.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs))

    ok = [r for r in recs if "error" not in r]
    lat = [r["latency"] for r in ok if r.get("latency")]
    print(f"{args.model} effort={args.effort}: {len(ok)}/{len(recs)} ответов · ${sum(r['cost'] or 0 for r in recs):.4f} · "
          f"{wall:.0f} с · ответ ≈ {sum(lat) / len(lat) if lat else 0:.1f} с")
    coords = [r for r in ok if r["overlay"]["lat"] is not None]
    texts = [r for r in ok if r["overlay"]["raw_text"]]
    print(f"надписи на фото: {len(texts)}, из них с координатами {len(coords)}")
    for r in texts:
        o = r["overlay"]
        print(f"  {r['rel']}: {o['lat']}, {o['lon']} · {o['address']} · {o['datetime']} · «{(o['raw_text'] or '')[:80]}»")

    lp = pathlib.Path(args.labels) if args.labels else args.images / "labels.csv"
    if lp.exists():
        L = {lab.path_key(r["file"]): r for r in csv.DictReader(open(lp, encoding="utf-8"))}
        rows = [(L[lab.path_key(r["rel"])], r) for r in ok if lab.path_key(r["rel"]) in L]
        n = len(rows)
        per = {}
        for l, r in rows:
            a = per.setdefault(l["class"], [0, 0]); a[0] += l["class"] == r["condition"]; a[1] += 1
        defects_as_ok = [(l["class"], r["rel"]) for l, r in rows if not tax["classes"][l["class"]]["ok"] and tax["classes"][r["condition"]]["ok"]]
        print(f"точность {sum(l['class'] == r['condition'] for l, r in rows) / n:.1%} · тип {sum(l['kind'] == r['kind'] for l, r in rows) / n:.1%} · "
              f"{ {k: f'{a}/{b}' for k, (a, b) in per.items()} } · дефект назван нормой: {len(defects_as_ok)} {defects_as_ok}")
        with open(out / "llm_mistakes.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["file", "truth", "truth_desc", "llm", "llm_desc"])
            for l, r in rows:
                if l["class"] != r["condition"]:
                    w.writerow([r["rel"], l["class"], l["description"], r["condition"], r["description_ru"]])
    print(f"→ {out}")


if __name__ == "__main__":
    main()
