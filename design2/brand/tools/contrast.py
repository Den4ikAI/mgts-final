#!/usr/bin/env python3
"""Проверка контраста семантических токенов tokens.css в обеих темах.
Запуск: python3 tools/contrast.py > contrast.md
Полупрозрачные фоны накладываются на подложку, указанную в паре."""
import re, os, sys
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tokens.css')
css = re.sub(r'/\*.*?\*/', '', open(SRC).read(), flags=re.S)

def block(sel_regex):
    m = re.search(sel_regex + r'\s*\{(.*?)\n\}', css, re.S)
    return dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', m.group(1)))

prim = block(r':root')                                  # первый :root = примитивы
dark = block(r':root,\s*\[data-theme="dark"\]')
light = block(r'\n\[data-theme="light"\]')

def parse(v):
    v = v.strip()
    if v.startswith('#'):
        h = v[1:]; return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.match(r'rgb\((\d+)\s+(\d+)\s+(\d+)\s*/\s*([\d.]+)\)', v)
    if m: return tuple(int(m.group(i)) for i in (1, 2, 3)) + (float(m.group(4)),)
    raise ValueError(v)

def resolve(name, theme):
    v = theme.get(name, prim.get(name))
    while v and v.strip().startswith('var('):
        n = re.match(r'var\((--[\w-]+)\)', v.strip()).group(1)
        v = theme.get(n, prim.get(n))
    return parse(v)

def over(fg, bg):
    a = fg[3]
    return tuple(round(fg[i] * a + bg[i] * (1 - a)) for i in range(3)) + (1.0,)

def lum(c):
    def ch(x):
        x /= 255; return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c[i]) for i in range(3)); return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)

def hx(c): return '#%02X%02X%02X' % c[:3]

TEXT = []
for t in ['--text-primary', '--text-secondary', '--text-muted', '--text-accent', '--text-link']:
    for s in ['--surface-base', '--surface-raised', '--surface-sunken', '--surface-overlay']:
        TEXT.append((t, s, None))
TEXT += [('--text-link-hover', '--surface-base', None), ('--text-inverse', '--surface-inverse', None),
         ('--text-on-accent', '--action-primary', None), ('--text-on-accent', '--action-primary-hover', None),
         ('--text-on-accent', '--action-primary-press', None),
         ('--text-on-accent', '--action-danger', None), ('--text-on-accent', '--action-danger-hover', None),
         ('--action-secondary-fg', '--action-secondary', '--surface-base'),
         ('--accent-fg', '--accent-subtle', '--surface-raised'),
         ('--text-primary', '--surface-selected', '--surface-raised'),
         ('--text-on-scan', '--scan', None),
         ('--detect-tag-fg', '--detect-tag-bg', None),
         ('--sev-critical-fg', '--sev-critical-bg', None),
         ('--sev-fg', '--surface-raised', None),
         ('--status-on-solid', '--status-ok-solid', None),
         ('--status-on-solid', '--status-suspected-solid', None),
         ('--status-on-solid', '--status-defect-solid', None),
         ('--status-on-solid', '--status-critical-solid', None),
         ('--prov-model-fg', '--prov-model-bg', '--surface-raised'),
         ('--prov-human-fg', '--prov-human-bg', '--surface-raised'),
         ('--chart-label', '--surface-raised', None),
         ('--map-label', '--map-land', None), ('--map-label', '--map-block', None)]
for s in ['ok', 'suspected', 'defect', 'critical', 'not-observed']:
    TEXT.append((f'--status-{s}-fg', f'--status-{s}-bg', '--surface-raised'))
    TEXT.append((f'--status-{s}-fg', f'--status-{s}-bg', '--surface-base'))

GFX = []  # значимая графика ≥ 3:1
for s in ['ok', 'suspected', 'defect', 'critical', 'not-observed']:
    GFX.append((f'--status-{s}', '--surface-raised', None))
GFX += [('--focus-ring', '--surface-base', None), ('--focus-ring', '--surface-raised', None),
        ('--route-line', '--surface-base', None), ('--accent', '--surface-base', None),
        ('--sev-low', '--surface-raised', None), ('--sev-medium', '--surface-raised', None),
        ('--sev-high', '--surface-raised', None), ('--prov-model', '--surface-raised', None),
        ('--chart-accent', '--surface-raised', None), ('--status-not-observed-border', '--surface-raised', None),
        ('--route-line', '--map-land', None), ('--route-line', '--map-block', None),
        ('--map-pin-ring-suspected', '--status-suspected-solid', None)]

def run(pairs, theme, need):
    rows, fails = [], 0
    for fg, bg, under in pairs:
        b = resolve(bg, theme)
        if b[3] < 1: b = over(b, resolve(under or '--surface-base', theme))
        f = resolve(fg, theme)
        if f[3] < 1: f = over(f, b)
        r = ratio(f, b); ok = r >= need; fails += not ok
        u = f' на {under}' if under else ''
        rows.append(f'| `{fg}` | `{bg}`{u} | `{hx(f)}` / `{hx(b)}` | {r:.2f} | {"да" if ok else "НЕТ"} |')
    return rows, fails

out = ['# Контраст токенов «Попутно»', '',
       'Считается скриптом `brand/tools/contrast.py` прямо из `tokens.css` (WCAG 2.1, относительная яркость).',
       'Полупрозрачные фоны сначала накладываются на подложку из столбца «Фон». Порог: текст 4.5:1, значимая графика (иконки статуса, фокус, линия маршрута) 3:1.', '']
total = 0
for tname, th in [('Тёмная тема (основная)', dark), ('Светлая тема', light)]:
    for title, pairs, need in [('Текст, ≥ 4.5:1', TEXT, 4.5), ('Графика, ≥ 3:1', GFX, 3.0)]:
        rows, f = run(pairs, th, need); total += f
        out += [f'## {tname} · {title}', '', '| Текст / элемент | Фон | Цвета | Контраст | Проходит |', '|---|---|---|---|---|'] + rows + ['']
out += [f'Итог: {"все пары проходят" if total == 0 else f"не проходят {total} пар"}.', '',
        'Не проверяются как текст: `--text-disabled` (неактивное, WCAG не требует), `--border-*` (декоративные линии; значимые контуры идут через `--border-strong` и статусные цвета), `--scan` на светлом (циан на светлом не используется для текста по правилу бренда), `--status-*-solid` к подложке карты (метку читают по форме и знаку внутри, пара знак/заливка проверена выше через `--status-on-solid`).']
print('\n'.join(out))
sys.exit(1 if total else 0)
