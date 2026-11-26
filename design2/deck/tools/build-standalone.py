#!/usr/bin/env python3
"""Одна HTML-ка деки без внешних файлов: design2/deck-poputno.html.

Вклеивает стили (шрифты как data URI), скрипт и все картинки (фото, скриншоты сайта и телефона, QR).
  python3 deck/tools/build-deck.py && python3 deck/tools/build-standalone.py
"""
import base64
import re
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
OUT = DECK.parent / "deck-poputno.html"
MIME = {".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def data_uri(p: Path) -> str:
    return f"data:{MIME.get(p.suffix.lower(), 'application/octet-stream')};base64," + base64.b64encode(p.read_bytes()).decode()


def css_inline(p: Path) -> str:
    css = p.read_text(encoding="utf-8")

    def rep(m):
        u = m.group(2)
        if u.startswith(("data:", "http", "#")):
            return m.group(0)
        f = (p.parent / u.split("#")[0].split("?")[0]).resolve()
        return f'url("{data_uri(f)}")' if f.exists() else m.group(0)
    return re.sub(r'url\(\s*([\'"]?)([^\'")]+)\1\s*\)', rep, css)


def main():
    h = (DECK / "index.html").read_text(encoding="utf-8")
    h = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
               lambda m: "<style>\n" + css_inline((DECK / m.group(1)).resolve()).replace("</style", "<\\/style") + "\n</style>", h)
    h = re.sub(r'<script src="([^"]+)"></script>',
               lambda m: "<script>\n" + (DECK / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script") + "\n</script>", h)
    missing = []

    def rep(m):
        q, rel = m.group(1), m.group(2)
        f = (DECK / rel).resolve()
        if not f.exists():
            missing.append(rel)
            return m.group(0)
        return q + data_uri(f) + q
    h = re.sub(r'(["\'])((?:\.\./brand/logo|assets/(?:photos|site|mobile|qr))/[^"\'\s<>]+)\1', rep, h)
    OUT.write_text(h, encoding="utf-8")
    print(OUT, len(h) // 1024, "КБ", "нет файлов:" if missing else "", missing or "")


if __name__ == "__main__":
    main()
