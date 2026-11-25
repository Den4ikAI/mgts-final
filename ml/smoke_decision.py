#!/usr/bin/env python3
"""One-request smoke test for google/gemini-decision-1 via OpenRouter Decisions API.

Checks before the final: the key works, the balance is charged, an image goes
through, and what the answers look like. Standard library only.

    python3 ml/smoke_decision.py photo.jpg
    python3 ml/smoke_decision.py https://example.org/manhole.jpg

Key: OPENROUTER_API_KEY from the environment or from .env in the repo root.
"""
import base64
import json
import mimetypes
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

URL = "https://openrouter.ai/api/alpha/decisions"
MODEL = "google/gemini-decision-1"
ROOT = pathlib.Path(__file__).resolve().parent.parent


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.strip().startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'\"")
    if not key:
        sys.exit("OPENROUTER_API_KEY not set (env or .env in repo root)")
    return key


def image_part(src: str) -> dict:
    if src.startswith("https://"):
        url = src
    else:
        p = pathlib.Path(src)
        mime = mimetypes.guess_type(p.name)[0] or "image/jpeg"
        url = f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"
    return {"type": "image_url", "image_url": {"url": url}}


# Placeholder taxonomy: the real classes come from the organizers' dataset.
QUESTIONS = {
    "has_object": {
        "type": "noul",
        "instructions": "Is a cable well hatch (manhole cover) or a utility pole clearly visible in the photo?",
        "criteria": {
            "true": "A manhole cover / hatch or a utility pole is visible and can be assessed.",
            "false": "No such object, or the photo is too blurry, dark or occluded to assess it.",
        },
    },
    "defect_type": {
        "type": "choice",
        "instructions": "What is the main condition of the infrastructure object in the photo?",
        "criteria": {
            "none": "There is no manhole cover, hatch, utility pole or overhead cable to assess in the photo.",
            "ok": "Object looks intact, nothing to report.",
            "open_hatch": "Hatch is open, displaced or missing; an opening is visible.",
            "broken_cover": "Cover is cracked, broken or partially collapsed.",
            "subsidence": "Road surface around the hatch has sunk, cracked or there is a height step.",
            "paved_over": "Hatch is covered by asphalt or debris and is not accessible.",
            "pole_tilt": "Pole is visibly tilted or damaged.",
            "cable_sag": "Cable hangs too low or is detached.",
        },
    },
    "severity": {
        "type": "score",
        "instructions": "How dangerous is the condition for pedestrians and traffic right now?",
        "criteria": [
            "No danger.",
            "Minor, can wait for planned maintenance.",
            "Noticeable, should be fixed within days.",
            "Critical: immediate threat to life or vehicles.",
        ],
    },
}


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    body = {
        "model": MODEL,
        "state": [
            "Photo from a city service vehicle camera, Moscow street.",
            image_part(sys.argv[1]),
        ],
        "questions": QUESTIONS,
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
    )
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')}")
    except urllib.error.URLError as e:
        sys.exit(f"network error (VPN?): {e.reason}")
    print(f"latency: {time.monotonic() - t0:.2f}s  provider: {res.get('provider')}")
    print("usage:", json.dumps(res.get("usage"), ensure_ascii=False))
    print(json.dumps(res.get("answers"), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
