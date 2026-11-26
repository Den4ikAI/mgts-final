#!/usr/bin/env python3
"""QR-коды финального слайда: «Решение» (urls.solution) и «Код» (urls.code).

Что делает:
  1. Читает deck/numbers.json. Если ссылка ещё null, берёт заглушку из FALLBACK и помечает
     карточку как заглушку (на слайде видна плашка «[ДАННЫЕ] urls.…»).
  2. Строит QR с коррекцией ошибок H, вычищает центр под знак (не больше 15 % стороны символа).
  3. Пишет deck/assets/qr/qr-solution.svg и qr-code.svg (чёрное на белом, для печати и проверки телефоном).
  4. Вклеивает inline-SVG в deck/index.html между маркерами <!--QR:solution--> … <!--/QR:solution-->
     (модули разбиты на кольца от центра: дека собирает QR анимацией «модули прилетают от центра»).

Запуск (из любой папки):  python3 deck/tools/make-qr.py
Зависимость: пакет qrcode (apt python3-qrcode или pip install --user qrcode). Pillow не нужен.
"""
import json
import math
import re
import sys
from pathlib import Path

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_H
except ImportError:  # pragma: no cover
    sys.exit("Нужен пакет qrcode: pip install --user qrcode")

DECK = Path(__file__).resolve().parent.parent
NUMBERS = DECK / "numbers.json"
INDEX = DECK / "index.html"
OUT = DECK / "assets" / "qr"

# Заглушки, пока в numbers.json нет ссылок. На слайде такая карточка помечена плашкой.
FALLBACK = {
    "solution": "https://poputno.example/stand",
    "code": "https://github.com/Den4ikAI/mgts_hack_case_3",
}
QUIET = 4            # тихая зона в модулях (стандарт)
CENTER_SHARE = 0.15  # доля стороны символа под знак, не больше 15 %
RINGS = 9            # сколько колец для анимации сборки


def load_urls():
    data = json.loads(NUMBERS.read_text(encoding="utf-8"))
    ph = data.get("placeholders", {})
    urls = {}
    for key in ("solution", "code"):
        value = (ph.get(f"urls.{key}") or {}).get("value")
        urls[key] = (value, value is None)
    return urls


def matrix_for(url):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=0, box_size=1)
    qr.add_data(url)
    qr.make(fit=True)
    return [[bool(c) for c in row] for row in qr.get_matrix()]


def finder_cells(n):
    """Клетки трёх поисковых квадратов 7×7 (без разделителя)."""
    cells = set()
    for (r0, c0) in ((0, 0), (0, n - 7), (n - 7, 0)):
        for r in range(7):
            for c in range(7):
                cells.add((r0 + r, c0 + c))
    return cells


def center_clear(n):
    """Квадрат в центре под знак: нечётное число модулей, не больше 15 % стороны."""
    k = int(math.floor(n * CENTER_SHARE))
    if k % 2 == 0:
        k -= 1
    k = max(k, 3)
    start = (n - k) // 2
    return start, k


def build_svg(url, inline=False):
    m = matrix_for(url)
    n = len(m)
    finders = finder_cells(n)
    c_start, c_size = center_clear(n)
    center = set((r, c) for r in range(c_start, c_start + c_size) for c in range(c_start, c_start + c_size))
    size = n + 2 * QUIET
    mid = (n - 1) / 2
    max_d = math.hypot(mid, mid)
    rings = [[] for _ in range(RINGS)]
    for r in range(n):
        for c in range(n):
            if not m[r][c] or (r, c) in finders or (r, c) in center:
                continue
            d = math.hypot(r - mid, c - mid) / max_d
            idx = min(RINGS - 1, int(d * RINGS))
            rings[idx].append(f"M{c + QUIET} {r + QUIET}h1v1h-1z")

    def finder_path(r0, c0):
        x, y = c0 + QUIET, r0 + QUIET
        # внешнее кольцо 7×7 с дыркой 5×5 и центр 3×3
        return (f"M{x} {y}h7v7h-7z M{x + 1} {y + 1}v5h5v-5z "
                f"M{x + 2} {y + 2}h3v3h-3z")

    fill = 'fill="currentColor"' if inline else 'fill="#000"'
    parts = []
    if not inline:
        parts.append(f'<rect width="{size}" height="{size}" fill="#fff"/>')
    for i, ring in enumerate(rings):
        if ring:
            parts.append(f'<path class="qr-ring" style="--r:{i}" {fill} d="{"".join(ring)}"/>')
    for (r0, c0) in ((0, 0), (0, n - 7), (n - 7, 0)):
        parts.append(f'<path class="qr-finder" fill-rule="evenodd" {fill} d="{finder_path(r0, c0)}"/>')
    attrs = (f'class="qr-svg" viewBox="0 0 {size} {size}" shape-rendering="crispEdges" '
             f'role="img" aria-label="QR: {url}"') if inline else (
             f'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size * 10}" '
             f'height="{size * 10}" shape-rendering="crispEdges"')
    svg = f"<svg {attrs}>{''.join(parts)}</svg>"
    # доля знака от всего SVG (с тихой зоной): для позиционирования в деке
    mark_pct = c_size / size * 100
    return svg, n, c_size, mark_pct


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    html = INDEX.read_text(encoding="utf-8")
    for key, (value, is_placeholder) in load_urls().items():
        url = value or FALLBACK[key]
        file_svg, n, c_size, _ = build_svg(url, inline=False)
        (OUT / f"qr-{key}.svg").write_text(file_svg, encoding="utf-8")
        inline_svg, _, _, mark_pct = build_svg(url, inline=True)
        block = (f'<div class="qr-box" data-qr-url="{url}" data-qr-placeholder="{str(is_placeholder).lower()}" '
                 f'style="--mark-pct:{mark_pct:.2f}%">{inline_svg}'
                 f'<span class="qr-mark" data-mark></span></div>')
        pattern = re.compile(rf"(<!--QR:{key}-->)(.*?)(<!--/QR:{key}-->)", re.S)
        # дека v4 показывает QR файлами assets/qr/qr-*.svg; маркеры inline-вставки необязательны
        if pattern.search(html):
            html = pattern.sub(lambda mo: mo.group(1) + block + mo.group(3), html)
        share = c_size / n * 100
        print(f"QR {key}: {url} {'(заглушка)' if is_placeholder else ''} версия {(n - 17) // 4}, "
              f"{n}×{n} модулей, центр {c_size}×{c_size} = {share:.1f} % стороны, коррекция H")
    INDEX.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
