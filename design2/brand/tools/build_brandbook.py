#!/usr/bin/env python3
"""Вклеивает в brand/index.html спрайт иконок, знак, логотип и копию tokens.css.

Маркеры в index.html (повторный запуск безопасен):
  <!--ICONS--><!--/ICONS-->             спрайт icons.svg (file:// не грузит внешний спрайт)
  <!--LOGO attrs--> … <!--/LOGO-->       inline logo/logo-dark.svg, attrs ставятся на <svg>
  <!--MARK attrs--> … <!--/MARK-->       inline logo/mark.svg, attrs ставятся на <svg>
  <!--TOKENS--> … <!--/TOKENS-->         текст tokens.css для списка токенов и экспорта JSON
Цвета знака перекрашивает класс .pp-logo через --logo-mark / --logo-dot / --logo-word.
Порядок сборки: python3 logo/build_logo.py && python3 tools/build_icons.py && python3 tools/build_brandbook.py"""
import os, re

B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
rd = lambda p: open(os.path.join(B, p), encoding='utf-8').read()

sprite = re.search(r'<svg xmlns.*</svg>', rd('icons.svg'), re.S).group(0)
logo = rd('logo/logo-dark.svg').strip()
logo_vb = re.search(r'viewBox="([^"]+)"', logo).group(1)
logo_inner = re.search(r'</title>(.*)</svg>', logo, re.S).group(1)
mark_inner = re.search(r'</title>(.*)</svg>', rd('logo/mark.svg'), re.S).group(1)
tokens = rd('tokens.css')
assert '</script' not in tokens.lower()

p = os.path.join(B, 'index.html')
s = open(p, encoding='utf-8').read()

s = re.sub(r'<!--ICONS-->.*?<!--/ICONS-->', lambda m: '<!--ICONS-->' + sprite + '<!--/ICONS-->', s, flags=re.S)
s = re.sub(r'<!--TOKENS-->.*?<!--/TOKENS-->', lambda m: '<!--TOKENS-->' + tokens + '<!--/TOKENS-->', s, flags=re.S)
s = re.sub(r'<!--LOGO( [^>]*?)?-->.*?<!--/LOGO-->',
           lambda m: f'<!--LOGO{m.group(1) or ""}--><svg xmlns="http://www.w3.org/2000/svg" viewBox="{logo_vb}"{m.group(1) or ""}>{logo_inner}</svg><!--/LOGO-->', s, flags=re.S)
s = re.sub(r'<!--MARK( [^>]*?)?-->.*?<!--/MARK-->',
           lambda m: f'<!--MARK{m.group(1) or ""}--><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"{m.group(1) or ""}>{mark_inner}</svg><!--/MARK-->', s, flags=re.S)

open(p, 'w', encoding='utf-8').write(s)
print('index.html updated:', len(re.findall('<!--LOGO', s)), 'logos,', len(re.findall('<!--MARK', s)), 'marks')
