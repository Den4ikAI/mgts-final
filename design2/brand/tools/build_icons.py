#!/usr/bin/env python3
"""Иконки «Попутно»: сетка 24, штрих 1.75, круглые концы и стыки, currentColor.
Пишет brand/icons.svg (спрайт <symbol id="i-…">), brand/icons/*.svg (по одной)

"""
import os, re
BRAND = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

ICONS = {
    # статусы объекта (форма + цвет, цвет не единственный носитель)
    'status-ok':           '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.7"/>',
    'status-suspected':    '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.7a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.4"/><path d="M12 16.9h.01"/>',
    'status-defect':       '<path d="M14.6 6.4a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5.5 5.5 0 0 1-7.3 7.3l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a5.5 5.5 0 0 1 7.3-7.3z"/>',
    'status-critical':     '<path d="M13 2.8L4.6 13.4H11l-1 7.8 8.4-10.6H12l1-7.8z"/>',
    'status-not-observed': '<path d="M3 3l18 18"/><path d="M10.6 5.1c.5-.1.9-.1 1.4-.1 5 0 8.5 4.5 9.5 7-.4 1-1.2 2.3-2.3 3.5"/><path d="M6.6 6.6C4.5 8 3.1 10.2 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    # предметная область: ТКШ и РЩ на опоре, классы состояния
    'cabinet':   '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 7.5h14M12 7.5V21M8 11h2M8 13.5h2M8 16h2"/>',
    'board':     '<rect x="6" y="4" width="12" height="15" rx="1"/><path d="M12.9 7.5l-2.6 4h3.4l-2.6 4M9 21h6"/>',
    'corrosion': '<rect x="4" y="4" width="16" height="16" rx="1.5"/><circle cx="9.5" cy="9.5" r="2"/><circle cx="15.5" cy="14.5" r="2.5"/><path d="M15 7.5h.01M8.5 16h.01"/>',
    'dent':      '<path d="M5 4h14v6.5l-4 1.5 4 1.5V20H5z"/><path d="M9 4v16"/>',
    'mount':     '<path d="M5 2.5v19M5 6.5h3.5M5 17.5h2"/><rect x="9.5" y="5" width="9" height="12" rx="1" transform="rotate(10 14 11)"/><path d="M8.5 6.5l1 .2"/>',
    # в запасе: колодцы и опоры (первая версия кейса)
    'manhole':   '<circle cx="12" cy="12" r="9"/><path d="M7.5 8.5h9M6 12h12M7.5 15.5h9"/>',
    'pole':      '<path d="M12 3v18M6.5 5.5h11M9 21h6M8 5.5V4M16 5.5V4M6.5 5.5c-.8 2-2 3.2-3.5 3.8M17.5 5.5c.8 2 2 3.2 3.5 3.8"/>',
    'camera':    '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    'car':       '<path d="M5 17H3.8a.8.8 0 0 1-.8-.8V13l1.9-4.1A1.5 1.5 0 0 1 6.3 8h8.4a1.5 1.5 0 0 1 1.2.6l3 3.9h1.3a.8.8 0 0 1 .8.8v2.9a.8.8 0 0 1-.8.8H19M9 17h6M3.4 12.5h16"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    'route':     '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h9a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h9"/>',
    'map-pin':   '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    'frame':     '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="2.5"/>',
    'user-check':'<circle cx="10" cy="8" r="4"/><path d="M3 20a7 7 0 0 1 10.5-6"/><path d="M15.5 18l2 2 4-4"/>',
    # интерфейс
    'list':      '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    'queue':     '<path d="M4 13l2.5-7h11l2.5 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1 2h5l1-2H20"/>',
    'chart':     '<path d="M4 20h16M7 16v-4M12 16V7M17 16v-6"/>',
    'user':      '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    'filter':    '<path d="M4 6h16M7 12h10M10 18h4"/>',
    'search':    '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
    'upload':    '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'close':     '<path d="M6 6l12 12M18 6L6 18"/>',
    'check':     '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'plus':      '<path d="M12 5v14M5 12h14"/>',
    'layers':    '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
    'clock':     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'alert':     '<path d="M10.3 4.3L2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.1h.01"/>',
    'eye':       '<path d="M2.5 12C3.5 9.5 7 5 12 5s8.5 4.5 9.5 7c-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7z"/><circle cx="12" cy="12" r="3"/>',
    'sun':       '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    'moon':      '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
}
ATTR = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'

def main():
    syms = ''.join(f'<symbol id="i-{k}" viewBox="0 0 24 24" {ATTR}>{v}</symbol>' for k, v in ICONS.items())
    sprite = f'<svg xmlns="http://www.w3.org/2000/svg" style="display:none">{syms}</svg>'
    open(os.path.join(BRAND, 'icons.svg'), 'w').write(
        '<!-- Попутно · иконки. Сетка 24, штрих 1.75, currentColor. Использование: '
        '<svg class="pp-icon"><use href="icons.svg#i-search"/></svg> -->\n' + sprite + '\n')
    d = os.path.join(BRAND, 'icons'); os.makedirs(d, exist_ok=True)
    for k, v in ICONS.items():
        open(os.path.join(d, f'{k}.svg'), 'w').write(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" {ATTR}>{v}</svg>\n')
    print(len(ICONS), 'icons')

if __name__ == '__main__':
    main()
