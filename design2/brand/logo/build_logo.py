#!/usr/bin/env python3
"""Сборка SVG-логотипов «Попутно» из геометрии знака и кривых Unbounded 600.

Запуск: python3 build_logo.py   (нужны fonttools и brotli)
Все цвета ниже совпадают с примитивами tokens.css (--p-*). Меняешь цвет: меняй и там.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, '..', 'fonts')

# --- примитивы (= tokens.css) ---
NAVY_950 = '#030E1C'; NAVY_900 = '#061A2E'
SIGNAL_400 = '#3A98EE'; SIGNAL_500 = '#0A84E6'; SIGNAL_600 = '#0068C2'
SCAN_400 = '#2ADCF0'; SCAN_600 = '#009EBF'
SLATE_25 = '#F5F8FB'; WHITE = '#FFFFFF'; SLATE_400 = '#8A97A8'
OK = '#1FA971'; SUSP = '#E8B520'; DEFECT = '#EC7A1C'; CRIT = '#E5383B'

# --- геометрия знака, сетка 64 ---
M_INSET = 8      # отступ рамки от края
ARM = 17         # длина плеча уголка
STROKE = 6       # толщина уголка и линии маршрута
R_OUT = 2        # скругление внешнего угла
DOT_R = 8        # точка-объект, диаметр 16
GAP = 3          # зазор между линией маршрута и точкой
SLANT = 3        # срез концов линии маршрута


def _n(v):
    return ('%.2f' % v).rstrip('0').rstrip('.')


def bracket_d(x0, y0, L=ARM, t=STROKE, r=R_OUT):
    return (f"M{x0} {y0+L}V{y0+r}A{r} {r} 0 0 1 {x0+r} {y0}"
            f"H{x0+L}V{y0+t}H{x0+t}V{y0+L}Z")


def brackets_d(inset=M_INSET, L=ARM, t=STROKE, r=R_OUT, size=64):
    """Четыре уголка одним path (без transform, чтобы удобно анимировать и печатать)."""
    a, b = inset, size - inset
    tl = bracket_d(a, a, L, t, r)
    tr = (f"M{b-L} {a}H{b-r}A{r} {r} 0 0 1 {b} {a+r}V{a+L}H{b-t}V{a+t}H{b-L}Z")
    br = (f"M{b} {b-L}V{b-r}A{r} {r} 0 0 1 {b-r} {b}H{b-L}V{b-t}H{b-t}V{b-L}Z")
    bl = (f"M{a+L} {b}H{a+r}A{r} {r} 0 0 1 {a} {b-r}V{b-L}H{a+t}V{b-t}H{a+L}Z")
    return tl, tr, br, bl


def route_d(t=STROKE, gap=GAP, dot_r=DOT_R, slant=SLANT, x0=0, x1=64, cy=32):
    y0, y1 = cy - t / 2, cy + t / 2
    a, b = cy - dot_r - gap, cy + dot_r + gap
    left = f"M{_n(x0+slant)} {_n(y0)}H{_n(a)}V{_n(y1)}H{_n(x0)}Z"
    right = f"M{_n(b)} {_n(y0)}H{_n(x1)}L{_n(x1-slant)} {_n(y1)}H{_n(b)}Z"
    return left, right


def mark_g(br, line, dot, cls=True):
    """Знак как группа: .pp-mark__frame / __route / __dot — классы нужны для анимации."""
    tl, tr, brr, bl = brackets_d()
    l, r = route_d()
    c = (lambda s: f' class="{s}"') if cls else (lambda s: '')
    return (f'<g{c("pp-mark__route")} fill="{line}"><path{c("pp-mark__route-l")} d="{l}"/>'
            f'<path{c("pp-mark__route-r")} d="{r}"/></g>'
            f'<g{c("pp-mark__frame")} fill="{br}">'
            f'<path{c("pp-mark__c pp-mark__c--tl")} d="{tl}"/><path{c("pp-mark__c pp-mark__c--tr")} d="{tr}"/>'
            f'<path{c("pp-mark__c pp-mark__c--br")} d="{brr}"/><path{c("pp-mark__c pp-mark__c--bl")} d="{bl}"/></g>'
            f'<circle{c("pp-mark__dot")} cx="32" cy="32" r="{DOT_R}" fill="{dot}"/>')


# --- шрифты в кривые ---
_cache = {}


def font(name, wght):
    key = (name, wght)
    if key not in _cache:
        f = TTFont(os.path.join(FONTS, name))
        _cache[key] = instancer.instantiateVariableFont(f, {"wght": wght})
    return _cache[key]


def text_path(text, font_obj, size_px=None, xh=None, x=0, baseline=0, track=0.0, kern=None):
    """Возвращает (d, правый край краски, левый край). size_px: кегль; xh: высота строчных (вместо кегля)."""
    fonts = font_obj if isinstance(font_obj, (list, tuple)) else [font_obj]
    upm = fonts[0]['head'].unitsPerEm
    if xh is not None:
        s = xh / fonts[0]['OS/2'].sxHeight
    else:
        s = size_px / upm
    pen = SVGPathPen(None, ntos=_n)
    kern = kern or {}
    cx = 0.0; right = x
    for i, ch in enumerate(text):
        fo = next(f for f in fonts if ord(ch) in f.getBestCmap())  # кириллица, затем латиница
        gs = fo.getGlyphSet(); n = fo.getBestCmap()[ord(ch)]
        adv, lsb = fo['hmtx'][n]
        pen.glyphSet = gs
        if i == 0:
            cx = -lsb
        bp = BoundsPen(gs); gs[n].draw(bp)
        if bp.bounds:
            gs[n].draw(TransformPen(pen, (s, 0, 0, -s, x + cx * s, baseline)))
            right = x + (cx + bp.bounds[2]) * s
        cx += adv + track * upm + kern.get(i, 0)
    return pen.getCommands(), right


# --- словесный знак: Unbounded 600, строчные, трекинг −2 %, у–т поджато на 30 ед. ---
UNB = 'Unbounded-cyrillic.woff2'
WORD_XH = 28            # высота строчных в единицах сетки знака 64
WORD_GAP = 16           # зазор знак–слово = длина плеча из брифа (16/64)


def wordmark(x):
    unb = font(UNB, 600)
    return text_path('попутно', unb, xh=WORD_XH, x=x, baseline=32 + WORD_XH / 2,
                     track=-0.02, kern={3: -30})


def svg(w, h, body, title, extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_n(w)} {_n(h)}" '
            f'width="{_n(w)}" height="{_n(h)}" role="img" aria-label="{title}"{extra}>'
            f'<title>{title}</title>{body}</svg>\n')


def write(name, content):
    with open(os.path.join(HERE, name), 'w') as fh:
        fh.write(content)
    print('wrote', name)


def main():
    # знаки
    write('mark.svg', svg(64, 64, mark_g(SIGNAL_500, SIGNAL_500, SCAN_400), 'Попутно'))
    write('mark-light.svg', svg(64, 64, mark_g(SIGNAL_600, SIGNAL_600, SCAN_600), 'Попутно'))
    write('mark-mono-white.svg', svg(64, 64, mark_g(WHITE, WHITE, WHITE), 'Попутно'))
    write('mark-mono-navy.svg', svg(64, 64, mark_g(NAVY_900, NAVY_900, NAVY_900), 'Попутно'))

    # локапы: знак 64 + зазор 16 + слово
    d, right = wordmark(64 + WORD_GAP)
    W = right
    def lockup(br, line, dot, word, name):
        body = mark_g(br, line, dot) + f'<path class="pp-logo__word" fill="{word}" d="{d}"/>'
        write(name, svg(W, 64, body, 'Попутно'))
    lockup(SIGNAL_500, SIGNAL_500, SCAN_400, SLATE_25, 'logo-dark.svg')
    lockup(SIGNAL_600, SIGNAL_600, SCAN_600, NAVY_900, 'logo-light.svg')
    lockup(WHITE, WHITE, WHITE, WHITE, 'logo-mono-white.svg')
    lockup(NAVY_900, NAVY_900, NAVY_900, NAVY_900, 'logo-mono-navy.svg')
    lockup(WHITE, WHITE, NAVY_950, WHITE, 'logo-on-signal.svg')

    # только слово
    dw, rw = wordmark(0)
    write('wordmark-dark.svg', svg(rw, 64, f'<path fill="{SLATE_25}" d="{dw}"/>', 'попутно'))
    write('wordmark-light.svg', svg(rw, 64, f'<path fill="{NAVY_900}" d="{dw}"/>', 'попутно'))

    # фавикон: сетка 32, плитка navy, уголки толще относительно размера, без линии маршрута
    fb = brackets_d(inset=6, L=8, t=3, r=1, size=32)
    fav = (f'<rect width="32" height="32" rx="7" fill="{NAVY_900}"/>'
           f'<g fill="{SIGNAL_400}">' + ''.join(f'<path d="{p}"/>' for p in fb) + '</g>'
           f'<circle cx="16" cy="16" r="4" fill="{SCAN_400}"/>')
    write('favicon.svg', svg(32, 32, fav, 'Попутно'))

    # OG 1200×630
    write('og-cover.svg', og())


def og():
    W, H = 1200, 630
    unb = [font(UNB, 600), font('Unbounded-latin.woff2', 600)]
    golos = [font('GolosText-cyrillic.woff2', 500), font('GolosText-latin.woff2', 500)]
    mono = [font('JetBrainsMono-cyrillic.woff2', 500), font('JetBrainsMono-latin.woff2', 500)]
    parts = [f'<rect width="{W}" height="{H}" fill="{NAVY_950}"/>']
    # тонкая сетка-«дорожная разметка» только справа, очень тихо
    # логотип (масштаб 0.75 → высота 48)
    d, right = wordmark(64 + WORD_GAP)
    parts.append(f'<g transform="translate(80 72) scale(0.75)">{mark_g(SIGNAL_500, SIGNAL_500, SCAN_400, cls=False)}'
                 f'<path fill="{SLATE_25}" d="{d}"/></g>')
    # заголовок
    y = 220
    for line in ['Машины уже едут.', 'Инфраструктуру', 'проверяем попутно.']:
        dl, _ = text_path(line, unb, size_px=62, x=80, baseline=y, track=-0.025)
        parts.append(f'<path fill="{SLATE_25}" d="{dl}"/>')
        y += 76
    # маршрут через всю карточку с объектами по пути
    ry = 500
    parts.append(f'<path fill="{SIGNAL_500}" d="M0 {ry-2}H{W}V{ry+2}H0Z" opacity="1"/>')
    objs = [(120, OK), (260, OK), (400, SUSP), (540, OK), (680, OK), (820, OK), (960, None), (1100, OK)]
    for x, col in objs:
        if col is None:
            continue
        parts.append(f'<circle cx="{x}" cy="{ry}" r="9" fill="{NAVY_950}"/><circle cx="{x}" cy="{ry}" r="6" fill="{col}"/>')
    # объект в рамке детекции: дефект, уголки scan
    fx = 960; fs = 52
    fb = brackets_d(inset=0, L=16, t=4, r=2, size=2 * fs)
    parts.append(f'<g transform="translate({fx-fs} {ry-fs})" fill="{SCAN_400}">' + ''.join(f'<path d="{p}"/>' for p in fb) + '</g>')
    parts.append(f'<circle cx="{fx}" cy="{ry}" r="14" fill="{NAVY_950}"/><circle cx="{fx}" cy="{ry}" r="10" fill="{DEFECT}"/>')
    # бирка над рамкой
    tag, tr = text_path('Открытый люк · 0.95', mono, size_px=17, x=fx - fs + 12, baseline=ry - fs - 16)
    tw = tr - (fx - fs) + 12
    parts.append(f'<rect x="{fx-fs}" y="{ry-fs-42}" width="{_n(tw)}" height="32" rx="4" fill="{SCAN_400}"/>'
                 f'<path fill="{NAVY_950}" d="{tag}"/>')
    # дескриптор
    dd, _ = text_path('Мониторинг инфраструктуры МГТС с камер служебных машин', golos, size_px=24, x=80, baseline=586)
    parts.append(f'<path fill="{SLATE_400}" d="{dd}"/>')
    return svg(W, H, ''.join(parts), 'Попутно. Машины уже едут. Инфраструктуру проверяем попутно.')


if __name__ == '__main__':
    main()
