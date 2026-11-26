#!/usr/bin/env python3
"""Uploads a folder of photos through the product API (POST /api/frames), the same
path a person uses on the «Проверить фото» page: S3 → Kafka → consumer.py → verdicts.

    .venv/bin/python upload.py ../data/Датасет-ДСС --labels ../data/Датасет-ДСС/labels.csv --id-col object_id

Login: API_LOGIN / API_PASSWORD (default dispatcher / mgts-demo), API_URL (http://localhost:8080).
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import pathlib
import time
import urllib.request
import uuid

import labels as lab

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def call(url: str, data: bytes, headers: dict) -> dict | list:
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def multipart(fields: list[tuple[str, str]], files: list[tuple[str, str, bytes]]) -> tuple[bytes, str]:
    b = uuid.uuid4().hex
    out = bytearray()
    for name, value in fields:
        out += f'--{b}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    for name, filename, data in files:
        ct = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        out += f'--{b}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {ct}\r\n\r\n'.encode()
        out += data + b"\r\n"
    out += f"--{b}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={b}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", type=pathlib.Path)
    ap.add_argument("--labels")
    ap.add_argument("--file-col", default="file")
    ap.add_argument("--id-col")
    ap.add_argument("--api", default=os.environ.get("API_URL", "http://localhost:8080"))
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    tok = call(f"{args.api}/api/auth/login",
               json.dumps({"login": os.environ.get("API_LOGIN", "dispatcher"),
                           "password": os.environ.get("API_PASSWORD", "mgts-demo")}).encode(),
               {"Content-Type": "application/json"})["access_token"]
    rows = lab.index_by_file(lab.read_table(args.labels), args.file_col) if args.labels else {}
    files = sorted(p for p in args.images.rglob("*") if p.suffix.lower() in IMAGE_EXT and p.is_file())
    if args.limit:
        files = files[: args.limit]

    t0, n = time.monotonic(), 0
    for p in files:
        row = lab.lookup(rows, p.relative_to(args.images).as_posix(), p.name) or {}
        fields = [("object_id", row[args.id_col])] if args.id_col and row.get(args.id_col) else []
        body, ct = multipart(fields, [("files", p.name, p.read_bytes())])
        res = call(f"{args.api}/api/frames", body, {"Content-Type": ct, "Authorization": f"Bearer {tok}"})
        n += len(res)
        print(f"  {res[0]['frame_id']} {p.relative_to(args.images)}", flush=True)
    print(f"{n} фото загружено за {time.monotonic() - t0:.1f} с; вердикты — на странице «Проверить фото» и в GET /api/frames")


if __name__ == "__main__":
    main()
