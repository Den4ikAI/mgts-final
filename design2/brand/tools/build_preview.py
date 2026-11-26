#!/usr/bin/env python3
"""Вклеивает в foundation-preview.html спрайт иконок и inline-логотип.
file:// не даёт подключать внешний спрайт через <use>, поэтому копия вставляется
между маркерами <!--ICONS-->…<!--/ICONS-->, <!--LOGO-->…<!--/LOGO-->, <!--MARK-->…<!--/MARK-->.
Порядок сборки: python3 logo/build_logo.py && python3 tools/build_icons.py && python3 tools/build_preview.py"""
import os, re
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
rd = lambda p: open(os.path.join(B, p)).read()
sprite = re.search(r'<svg xmlns.*</svg>', rd('icons.svg'), re.S).group(0)
logo = rd('logo/logo-dark.svg').strip()
logo = re.sub(r'<title>.*?</title>', '', logo)
logo = re.sub(r'^<svg ', '<svg class="pp-logo" ', logo)
logo = re.sub(r' width="[\d.]+" height="[\d.]+"', '', logo, count=1)
mark_inner = re.search(r'</title>(.*)</svg>', rd('logo/mark.svg'), re.S).group(1)
mark = f'<svg class="pp-mark pp-logo pp-mark-anim" id="hero-mark" viewBox="0 0 64 64" role="img" aria-label="Знак «Попутно»">{mark_inner}</svg>'
p = os.path.join(B, 'foundation-preview.html'); s = open(p).read()
for tag, val in [('ICONS', sprite), ('LOGO', logo), ('MARK', mark)]:
    s = re.sub(rf'<!--{tag}-->.*?<!--/{tag}-->', lambda m: f'<!--{tag}-->{val}<!--/{tag}-->', s, flags=re.S)
open(p, 'w').write(s); print('preview updated')
