#!/usr/bin/env python3
"""SVG-иконки бренда (design2/brand/icons) -> Kotlin ImageVector (core:designsystem).
Сетка 24, штрих 1.75, круглые концы. Цвет задаёт потребитель через tint."""
import re, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
def circle(a): cx,cy,r=float(a['cx']),float(a['cy']),float(a['r']); return f"M{cx-r} {cy}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0Z"
def rect(a):
    x,y,w,h=(float(a.get(k,0)) for k in('x','y','width','height')); rx=float(a.get('rx',0))
    if rx==0: return f"M{x} {y}h{w}v{h}h{-w}Z"
    return (f"M{x+rx} {y}h{w-2*rx}a{rx} {rx} 0 0 1 {rx} {rx}v{h-2*rx}a{rx} {rx} 0 0 1 {-rx} {rx}"
            f"h{-(w-2*rx)}a{rx} {rx} 0 0 1 {-rx} {-rx}v{-(h-2*rx)}a{rx} {rx} 0 0 1 {rx} {-rx}Z")
def camel(n): p=n.split('-'); return ''.join(x.capitalize() for x in p)
lines=["// Сгенерировано tools/gen_icons.py из design2/brand/icons. Не править руками.","package ru.poputno.core.designsystem.icons","",
"import androidx.compose.ui.graphics.Color","import androidx.compose.ui.graphics.SolidColor","import androidx.compose.ui.graphics.StrokeCap","import androidx.compose.ui.graphics.StrokeJoin","import androidx.compose.ui.graphics.vector.ImageVector","import androidx.compose.ui.graphics.vector.addPathNodes","import androidx.compose.ui.graphics.vector.PathParser","import androidx.compose.ui.unit.dp","",
"private fun icon(name: String, vararg paths: String): ImageVector = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {",
"    paths.forEach { d ->","        addPath(pathData = addPathNodes(d), stroke = SolidColor(Color.Black), strokeLineWidth = 1.75f,",
"            strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)","    }","}.build()","","/** Иконки бренда «Попутно». Монохром, красятся через tint. */","object PpIcons {"]
for f in sorted(src.glob('*.svg')):
    s=f.read_text(); ds=[]
    for tag,attrs in re.findall(r'<(path|circle|rect)\s([^>]*?)/?>',s):
        a=dict(re.findall(r'([\w-]+)="([^"]*)"',attrs))
        if a.get('fill') not in (None,'none') and tag!='path': pass
        ds.append(a['d'] if tag=='path' else circle(a) if tag=='circle' else rect(a))
    args=', '.join('"%s"'%d for d in ds)
    lines.append(f'    val {camel(f.stem)}: ImageVector by lazy {{ icon("{f.stem}", {args}) }}')
lines.append("}")
out.parent.mkdir(parents=True,exist_ok=True); out.write_text('\n'.join(lines)+'\n'); print(len(list(src.glob("*.svg"))),"icons")
