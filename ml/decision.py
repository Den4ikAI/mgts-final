"""Gemini Decision client + interpretation of its answers into a routing decision.

The question set is built from taxonomy.json, so swapping the organizers'
classes in the morning needs no code change.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import pathlib
import random
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field

URL = "https://openrouter.ai/api/alpha/decisions"
MODEL = os.environ.get("DECISION_MODEL", "google/gemini-decision-1")
ROOT = pathlib.Path(__file__).resolve().parent


class FatalApiError(RuntimeError):
    """Retrying will not help (bad key, no balance, bad request schema)."""


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    env = ROOT.parent / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.strip().startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'\"")
    if not key:
        raise FatalApiError("OPENROUTER_API_KEY not set (env or .env in repo root)")
    return key


def load_taxonomy(path: str | os.PathLike = ROOT / "taxonomy.json") -> dict:
    return json.loads(pathlib.Path(path).read_text())


def build_questions(tax: dict) -> dict:
    classes = tax["classes"]
    return {
        "has_object": {
            "type": "noul",
            "instructions": tax["object_question"]["instructions"],
            "criteria": {"true": tax["object_question"]["true"], "false": tax["object_question"]["false"]},
        },
        "kind": {
            "type": "choice",
            "instructions": tax["kind_question"]["instructions"],
            "criteria": tax["kind_question"]["classes"],
        },
        "defect": {
            "type": "choice",
            "instructions": tax["defect_question"]["instructions"],
            "criteria": {k: v["description"] for k, v in classes.items()},
        },
        "severity": {
            "type": "score",
            "instructions": tax["severity_question"]["instructions"],
            "criteria": [lvl["description"] for lvl in tax["severity_question"]["levels"]],
        },
        # Optional independent yes/no checks, one per defect: a second opinion that
        # is not squeezed into one probability budget with the other classes.
        **{
            f"check_{k}": {"type": "noul", "instructions": c["instructions"],
                           "criteria": {"true": c["true"], "false": c["false"]}}
            for k, c in tax.get("checks", {}).items()
        },
    }


def questions_hash(tax: dict) -> str:
    """Cache key part: only what is sent to the model (not thresholds)."""
    refs = [[r["file"], r["caption"]] for r in tax.get("references", [])]
    blob = json.dumps([MODEL, tax["context"], build_questions(tax)] + ([refs] if refs else []), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def image_bytes(path: pathlib.Path, max_side: int) -> tuple[bytes, str]:
    """Downscale big photos: fewer tokens, faster upload. Returns (bytes, mime)."""
    raw = path.read_bytes()
    if max_side <= 0:
        return raw, "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else f"image/{path.suffix.lower().lstrip('.')}"
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(raw)) as im:
        im = ImageOps.exif_transpose(im)
        if max(im.size) > max_side:
            im.thumbnail((max_side, max_side))
        out = io.BytesIO()
        im.convert("RGB").save(out, "JPEG", quality=88)
        return out.getvalue(), "image/jpeg"


class Client:
    def __init__(self, tax: dict, cache_dir: pathlib.Path = ROOT / ".cache", max_side: int = 1280):
        self.tax = tax
        self.questions = build_questions(tax)
        self.qhash = questions_hash(tax)
        self.cache = cache_dir / (self.qhash if max_side == 1280 else f"{self.qhash}-s{max_side}")
        self.cache.mkdir(parents=True, exist_ok=True)
        self.max_side = max_side
        self.reference_state = self._references()
        self.key = api_key()

    def _references(self) -> list:
        """Labeled example photos shown before the photo to assess (few-shot).
        Paths in taxonomy["references"] are relative to the repo root."""
        out = []
        for r in self.tax.get("references", []):
            data, mime = image_bytes(ROOT.parent / r["file"], 1024)
            out += [f"Reference example — {r['caption']}",
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}}]
        return out

    def ask(self, path: pathlib.Path, sha: str) -> tuple[dict, bool, float]:
        """Returns (raw response, from_cache, latency_s). Retries 429/5xx/network."""
        cached = self.cache / f"{sha}.json"
        if cached.exists():
            res = json.loads(cached.read_text())
            return res, True, float(res.get("_latency", 0.0))
        data, mime = image_bytes(path, self.max_side)
        body = {
            "model": MODEL,
            "state": [
                self.tax["context"],
                *self.reference_state,
                *(["Photo to assess:"] if self.reference_state else []),
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode()}"}},
            ],
            "questions": self.questions,
        }
        payload = json.dumps(body).encode()
        delay = 1.0
        for attempt in range(7):
            req = urllib.request.Request(
                URL, data=payload,
                headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
            )
            t0 = time.monotonic()
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    res = json.load(r)
                dt = time.monotonic() - t0
                res["_latency"] = round(dt, 3)
                tmp = cached.with_suffix(".tmp")
                tmp.write_text(json.dumps(res, ensure_ascii=False))
                tmp.replace(cached)
                return res, False, dt
            except urllib.error.HTTPError as e:
                msg = e.read().decode(errors="replace")[:300]
                if e.code in (400, 401, 402, 403, 404):
                    raise FatalApiError(f"HTTP {e.code}: {msg}") from None
                err = f"HTTP {e.code}: {msg}"
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                err = f"network: {e}"
            if attempt == 6:
                raise RuntimeError(err)
            time.sleep(delay + random.random() * delay)
            delay = min(delay * 2, 30)
        raise AssertionError("unreachable")


@dataclass
class Decision:
    route: str                      # not_observed | auto_ok | review | critical | error
    defect_type: str | None         # class key sent to the backend (None = fine)
    top: str | None                 # model's most likely class
    top_p: float
    object_p: float
    kind: str
    severity: str | None
    severity_score: float
    p_critical: float
    probs: dict = field(default_factory=dict)
    rationale: str = ""
    checks: dict = field(default_factory=dict)   # defect key -> P(yes) of its yes/no check


def interpret(res: dict, tax: dict) -> Decision:
    a = res.get("answers", {})
    th = tax["thresholds"]
    classes = tax["classes"]
    levels = tax["severity_question"]["levels"]

    obj = a.get("has_object", {})
    object_p = float(obj.get("noul", 0.0)) if obj.get("type") == "noul" else 0.0
    kind_ans = a.get("kind", {})
    defect = a.get("defect", {})
    sev = a.get("severity", {})

    probs = {k: float(v) for k, v in (defect.get("probabilities") or {}).items()}
    if defect.get("type") != "choice" or not probs:
        return Decision("review", None, None, 0.0, object_p, next(iter(tax["kind_question"]["classes"])), None, 0.0, 0.0, {},
                        "Модель не ответила на вопрос о состоянии — нужна проверка человеком")
    ranked = sorted(probs.items(), key=lambda kv: -kv[1])
    top, top_p = ranked[0]

    sev_probs = {int(k): float(v) for k, v in (sev.get("probabilities") or {}).items()}
    score = float(sev.get("score", 0.0)) if sev.get("type") == "score" else 0.0
    p_crit = sev_probs.get(len(levels) - 1, 0.0)
    if p_crit >= th["critical_prob"]:
        severity = "critical"
    elif score >= th["high_score"]:
        severity = "high"
    else:
        severity = levels[min(len(levels) - 1, max(0, round(score)))]["severity"]

    defects = [(k, p) for k, p in ranked if not classes[k]["ok"]]
    best_defect = defects[0][0] if defects else None
    kind = (classes[best_defect]["kind"] if not classes[top]["ok"] and best_defect else None) \
        or kind_ans.get("choice") or next(iter(tax["kind_question"]["classes"]))

    def pct(k: str, p: float) -> str:
        return f"{classes[k]['label']} {round(p * 100)}%"

    summary = " · ".join(pct(k, p) for k, p in ranked[:3]) + f" · опасность {score:.1f}/{len(levels) - 1}"

    checks = {k: float(a[f"check_{k}"].get("noul", 0.0)) for k in tax.get("checks", {})
              if a.get(f"check_{k}", {}).get("type") == "noul"}
    summary += check_note(checks, tax)
    route = choose_route(top, top_p, object_p, p_crit, severity, classes, th, checks)

    def out(defect: str | None, sev: str | None, text: str) -> Decision:
        return Decision(route, defect, top, top_p, object_p, kind, sev, score, p_crit, probs, text, checks)

    if route == "not_observed":
        return out(None, None, f"Объект не различим (уверенность {object_p:.2f}) · {summary}")
    if route == "auto_ok":
        return out(None, None, f"Норма, подтверждено автоматически · {summary}")
    if classes[top]["ok"]:
        # Uncertain "fine": send the most suspicious defect to a human (a fired check wins).
        fired = max(checks.items(), key=lambda kv: kv[1], default=(None, 0.0))
        defect = fired[0] if fired[1] >= th.get("check_max", 1.01) else best_defect
        return out(defect, severity, f"Модель не уверена, что всё в норме · {summary}")
    return out(top, severity, summary)


def choose_route(top: str, top_p: float, object_p: float, p_crit: float, severity: str | None,
                 classes: dict, th: dict, checks: dict | None = None) -> str:
    """Pure routing rule, also replayed by evaluate.py for the threshold sweep."""
    # Never suppress a visible defect: the object gate only applies when the model
    # itself leans to "nothing to report" (an open hatch has no cover to "see").
    if top == "none" or (classes[top]["ok"] and object_p < th["object_min"]):
        return "not_observed"
    check_hit = max((checks or {}).values(), default=0.0) >= th.get("check_max", 1.01)
    if classes[top]["ok"] and top_p >= th["auto_ok"] and p_crit < th["critical_prob"] and not check_hit:
        return "auto_ok"
    return "critical" if severity == "critical" else "review"


def check_note(checks: dict, tax: dict) -> str:
    hits = [f"{tax['classes'][k]['label']} {round(p * 100)}%" for k, p in sorted(checks.items(), key=lambda kv: -kv[1]) if p >= 0.5]
    return f" · проверки: {', '.join(hits)}" if hits else ""


def as_dict(d: Decision) -> dict:
    return asdict(d)
