#!/usr/bin/env python3
"""PNG-иконки из той же геометрии, что logo/mark.svg и logo/favicon.svg.

  logo/apple-touch-icon.png   180 × 180, плитка navy-900 в край (iOS скругляет сам), полный знак
  logo/icon-192.png           192 × 192, скруглённая плитка 7/32, полный знак, прозрачные углы
  logo/icon-512.png           512 × 512, то же
  logo/icon-maskable-512.png  512 × 512, navy-900 в край, знак внутри безопасного круга 80 %
  logo/site.webmanifest       манифест с этими иконками

Рендер через Chromium (Playwright), чтобы PNG совпадал со SVG пиксель в пиксель.
Запуск: python3 tools/build_favicons.py   (нужен playwright: pip install playwright && playwright install chromium)
Цвета берутся из logo/mark.svg (его собирает logo/build_logo.py из палитры tokens.css)."""
import os, re, json, glob

B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LOGO = os.path.join(B, 'logo')
mark = open(os.path.join(LOGO, 'mark.svg'), encoding='utf-8').read()
inner = re.search(r'</title>(.*)</svg>', mark, re.S).group(1)
tile = re.search(r'<rect[^>]*fill="(#[0-9A-Fa-f]{6})"', open(os.path.join(LOGO, 'favicon.svg'), encoding='utf-8').read()).group(1)

# (файл, размер, доля знака от стороны, скругление плитки в долях, прозрачный фон)
ICONS = [
    ('apple-touch-icon.png', 180, 0.70, 0, False),
    ('icon-192.png', 192, 0.66, 7 / 32, True),
    ('icon-512.png', 512, 0.66, 7 / 32, True),
    ('icon-maskable-512.png', 512, 0.70, 0, False),  # углы рамки на 0.70 × 0.53 = 37 % от центра < 40 %
]

def page(size, k, r):
    m = size * k
    return f'''<!doctype html><html><head><style>html,body{{margin:0;background:transparent}}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
<rect width="{size}" height="{size}" rx="{size * r}" fill="{tile}"/>
<svg x="{(size - m) / 2}" y="{(size - m) / 2}" width="{m}" height="{m}" viewBox="0 0 64 64">{inner}</svg>
</svg></body></html>'''

def main():
    from playwright.sync_api import sync_playwright
    exe = None
    for c in sorted(glob.glob(os.path.expanduser('~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell')), reverse=True):
        exe = c; break
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': exe} if exe else {}))
        for name, size, k, r, transparent in ICONS:
            pg = b.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
            pg.set_content(page(size, k, r))
            pg.screenshot(path=os.path.join(LOGO, name), omit_background=transparent, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            pg.close(); print('logo/' + name, size)
        b.close()
    man = {
        'name': 'Попутно', 'short_name': 'Попутно',
        'description': 'Мониторинг инфраструктуры МГТС с камер служебных машин',
        'theme_color': tile, 'background_color': tile, 'display': 'standalone',
        'icons': [
            {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }
    open(os.path.join(LOGO, 'site.webmanifest'), 'w', encoding='utf-8').write(json.dumps(man, ensure_ascii=False, indent=2) + '\n')
    print('logo/site.webmanifest')

if __name__ == '__main__':
    main()
