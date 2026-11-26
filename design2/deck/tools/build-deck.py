#!/usr/bin/env python3
"""Собирает deck/index.html из шаблона deck/src/slides.html и deck/numbers.json.

  python3 deck/tools/build-data.py      # цифры прогона и фото с рамками → numbers.json, assets/photos
  python3 deck/tools/build-deck.py      # шаблон + цифры → index.html (спрайт иконок и знак внутри)

Шаблон:
  {{key}}        значение placeholders[key].value из numbers.json; если null, видна плашка «[ДАННЫЕ] key»
  {{@name}}      HTML-фрагмент из функции FRAG[name] ниже (таблицы, галерея, фото с рамками)
  <!--ICONS-->   спрайт brand/icons.svg
  <!--MARK-->    шаблон знака brand/logo/mark.svg (цвета берёт из токенов --logo-mark / --logo-dot)
Скриншоты сайта и телефона подключаются по именам файлов (assets/site/*.webp, assets/mobile/*.webp):
положите новый файл с тем же именем, и дека подхватит его без пересборки.
"""
import html
import json
import re
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent
ROOT = DECK.parent
SRC = DECK / "src" / "slides.html"
OUT = DECK / "index.html"
NUM = json.loads((DECK / "numbers.json").read_text(encoding="utf-8"))["placeholders"]


def v(key):
    e = NUM.get(key)
    return None if e is None else e.get("value")


def text(key):
    val = v(key)
    if val is None:
        return f'<span class="plate">[ДАННЫЕ] {html.escape(key)}</span>'
    if isinstance(val, bool):
        return "да" if val else "нет"
    return html.escape(str(val))


def num(x):
    """Число для data-count: 91,8 → 91.8"""
    return str(x).replace(",", ".").replace(" ", "")


ICON_OF = {"ok": "i-status-ok", "paint": "i-corrosion", "deformation": "i-dent", "mount_failure": "i-mount"}
STATUS_ICON = {"critical": "i-status-critical", "defect": "i-status-defect", "suspected": "i-status-suspected",
               "ok": "i-status-ok", "not_observed": "i-status-not-observed"}
STATUS_NAME = {"critical": "Критично", "defect": "Дефект", "suspected": "Проверить", "ok": "Норма", "not_observed": "Не наблюдается"}


ICON_ALIAS = {"crit": "status-critical", "susp": "status-suspected", "ok": "status-ok", "none": "status-not-observed",
              "usercheck": "user-check", "pin": "map-pin"}


def icon(name, cls=""):
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} aria-hidden="true"><use href="#{name}"/></svg>'


def shot(f, cls="", style="", sid="", cap="", tag=True, bd="0.9s"):
    """Фото с рамкой детекции: f = {img, box:{x,y,w,h}, cls, tag, p}"""
    b = f["box"]
    box_cls = "pp-detect__box" + (f" pp-detect__box--{f['cls']}" if f.get("cls") else "")
    tagh = f'<span class="pp-detect__tag">{html.escape(f["tag"])} · <b>{f["p"]}</b></span>' if tag and f.get("tag") else ""
    below = " pp-detect__box--below" if b["y"] < 0.12 else ""
    idattr = f' id="{sid}"' if sid else ""
    st = f' style="{style}"' if style else ""
    caph = f'<div class="cap">{cap}</div>' if cap else ""
    return (f'<figure class="shot pp-detect {cls}"{idattr}{st}><img src="assets/photos/{f["img"]}" alt="">'
            f'<span class="{box_cls}{below}" style="--x:{b["x"]*100:.2f}%;--y:{b["y"]*100:.2f}%;--w:{b["w"]*100:.2f}%;--h:{b["h"]*100:.2f}%;--bd:{bd}">{tagh}</span>{caph}</figure>')


# ---------------------------------------------------------------- фрагменты
def frag_problem_shot():
    f = v("example.pain")
    cap = f'<span>{text("example.object_id")}</span><span>держится на кабеле</span>'
    return shot(f, "a", "--d:.5s", cap=cap, bd="1.2s")


GLABEL = {"ok": "Норма", "paint": "Коррозия, ЛКП", "deformation": "Деформация, МП", "mount_failure": "Крепление"}


def frag_gallery():
    out = []
    tot = max(g["count"] for g in v("data.gallery"))
    for i, g in enumerate(v("data.gallery")):
        d = 0.5 + i * 0.12
        out.append(
            f'<div class="gcard panel a k-{g["cls_key"]}" style="--d:{d:.2f}s">{shot(g, "sm", tag=False, bd=f"{d + .7:.2f}s")}'
            f'<div class="gl">{icon(ICON_OF[g["cls_key"]])}{GLABEL[g["cls_key"]]}</div>'
            f'<div class="gn"><b data-count="{g["count"]}" data-d="{d + .3:.2f}">{g["count"]}</b><span>фото в разметке</span></div>'
            f'<div class="tr"><i class="gx" style="width:{g["count"] / tot * 100:.0f}%;--d:{d + .4:.2f}s"></i></div></div>')
    return "\n".join(out)


def frag_solution_shot():
    f = v("example.site")
    cap = f'<span>{text("example.object_id")}</span><span>фото бригады</span>'
    return shot(f, "a", "--d:.3s", sid="sol-shot", cap=cap, bd="1s")


def frag_model_shot():
    f = v("example.cv")
    return shot(f, "a", "--d:.3s", cap=f'<span>{text("example.object_id")}</span>', bd=".9s")


def frag_answers():
    a = v("example.answers")
    rows = []
    # 1. объект виден
    rows.append(("Виден ли шкаф или щит?", f'<div class="bar-row top"><span>да</span><div class="tr"><i class="gx" style="width:{a["object_p"]*100:.0f}%;--d:1.0s"></i></div><b>{a["object_p"]:.2f}</b></div>'))
    # 2. тип
    rows.append(("Что это?", f'<div><span class="chip sm accent">{icon("i-cabinet")}<b>{a["kind"]}</b>&nbsp;телекоммуникационный шкаф</span></div>'))
    # 3. состояние
    probs = a["probs"]
    top = max(p for _, p in probs)
    st = "".join(
        f'<div class="bar-row{" top crit" if p == top else ""}"><span>{html.escape(n)}</span><div class="tr"><i class="gx" style="width:{max(p*100, 1):.0f}%;--d:{1.2 + i*.08:.2f}s"></i></div><b>{p:.2f}</b></div>'
        for i, (n, p) in enumerate(probs))
    rows.append(("Какое состояние?", st))
    # 4. срочность
    rows.append(("Насколько срочно?", f'<div class="bar-row top crit"><span>угроза жизни</span><div class="tr"><i class="gx" style="width:{a["p_critical"]*100:.0f}%;--d:1.6s"></i></div><b>{a["p_critical"]:.2f}</b></div>'))
    # 5. проверки да/нет
    ch = "".join(
        f'<div class="bar-row"><span>{html.escape(n)}: есть?</span><div class="tr"><i class="gx" style="width:{max(p*100, 1):.0f}%;--d:{1.8 + i*.08:.2f}s"></i></div><b>{p:.2f}</b></div>'
        for i, (n, p) in enumerate(a["checks"]))
    rows.append(("Проверки да или нет", ch))
    out = []
    for i, (q, body) in enumerate(rows):
        out.append(f'<div class="qrow a" style="--d:{.6 + i*.1:.2f}s"><span class="qn">{i+1}</span><span class="qq">{q}</span><div class="qa-list">{body}</div></div>')
    return "\n".join(out)


def frag_sweep():
    rows = v("sweep.rows")
    chosen = float(num(v("thresholds.auto_ok")))
    keep = [r for r in rows if r["auto_ok"] in (0.5, 0.6, 0.7, 0.8, 0.9)]
    mx = max(r["auto_share"] for r in keep) or 1
    out = []
    for i, r in enumerate(keep):
        best = abs(r["auto_ok"] - chosen) < 1e-9
        miss = r["defects_missed"]
        missh = (f'<span class="miss bad">{icon("i-alert")}{miss} пропуск</span>' if miss
                 else f'<span class="miss">{icon("i-check")}0 пропусков</span>')
        share = round(r["auto_share"] * 100)
        out.append(f'<div class="srow a{" best" if best else ""}" style="--d:{.7 + i*.1:.2f}s"><span class="th">{str(r["auto_ok"]).replace(".", ",")}</span>'
                   f'<div class="tr"><i class="gx" style="width:{max(r["auto_share"]/mx*100, 1):.0f}%;--d:{.9 + i*.1:.2f}s"></i></div>'
                   f'<span class="v">{share} %</span>{missh}</div>')
    return "\n".join(out)


def frag_confusion():
    c = v("a1.confusion")
    names = c["names"]
    head = "".join(f"<th>{html.escape(n)}</th>" for n in names)
    body = []
    for i, row in enumerate(c["matrix"]):
        cells = []
        for j, x in enumerate(row):
            cls = "diag" if i == j else ("err" if x else "zero")
            cells.append(f'<td class="{cls} pop" style="--d:{.5 + (i*4+j)*.03:.2f}s">{x}</td>')
        body.append(f"<tr><th>{html.escape(names[i])}</th>{''.join(cells)}</tr>")
    return f'<table><thead><tr><th>разметка ↓ · модель →</th>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'


def frag_per_class():
    pc = v("a1.per_class")
    rows = []
    for k, name in (("ok", "Удовлетворительно"), ("paint", "Повреждение ЛКП"), ("deformation", "Механическое повреждение"), ("mount_failure", "Нарушение крепления")):
        r = pc.get(k) or {}
        f = lambda x: "н/д" if x is None else f"{x:.2f}".replace(".", ",")
        rows.append(f'<tr><td><b>{name}</b></td><td class="m">{r.get("support", "")}</td><td class="m">{f(r.get("precision"))}</td><td class="m">{f(r.get("recall"))}</td><td class="m">{f(r.get("f1"))}</td></tr>')
    return "<table><thead><tr><th>Класс</th><th>Фото</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table>"


def frag_mistakes():
    out = []
    for i, m in enumerate(v("a2.mistakes")):
        route = {"review": "ушло диспетчеру", "critical": "тревога", "auto_ok": "закрыто само", "not_observed": "не наблюдается"}.get(m["route"], m["route"])
        out.append(f'<div class="panel a" style="--d:{.4 + i*.1:.2f}s">{shot(m["img"], "sm", tag=False, bd=f"{.9 + i*.1:.2f}s")}'
                   f'<h4>{html.escape(m["id"])}</h4><p>Разметка: <b>{html.escape(m["truth"])}</b><br>Модель: {html.escape(m["predicted"])} · {m["p"]}<br>Маршрут: <b>{route}</b></p></div>')
    return "\n".join(out)


def frag_variants():
    rows = []
    for r in v("a3.variants"):
        rows.append(f'<tr{" class=us" if r.get("chosen") else ""}><td><b>{html.escape(r["name"])}</b></td><td class="m">{html.escape(r["acc"])}</td><td class="m">{html.escape(r["cost"] or "")}</td><td>{html.escape(r["out"])}</td></tr>')
    return "<table><thead><tr><th>Вариант</th><th>Точность</th><th>Цена датасета</th><th>Вывод</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table>"


FRAG = {
    "problem_shot": frag_problem_shot, "gallery": frag_gallery, "solution_shot": frag_solution_shot,
    "model_shot": frag_model_shot, "answers": frag_answers, "sweep": frag_sweep,
    "confusion": frag_confusion, "per_class": frag_per_class, "mistakes": frag_mistakes, "variants": frag_variants,
}


def main():
    src = SRC.read_text(encoding="utf-8")

    def repl(m):
        k = m.group(1).strip()
        if k.startswith("@icon_"):
            name = k[6:]
            cls = ""
            for suf in ("_xs", "_s", "_v"):
                if name.endswith(suf):
                    name = name[: -len(suf)]
            return icon("i-" + ICON_ALIAS.get(name, name), cls)
        if k.startswith("@"):
            return FRAG[k[1:]]()
        if k.startswith("#"):          # число для data-count
            return num(v(k[1:]))
        return text(k)

    out = re.sub(r"\{\{\s*([@#]?[\w.]+)\s*\}\}", repl, src)
    sprite = (ROOT / "brand" / "icons.svg").read_text(encoding="utf-8")
    sprite = re.sub(r"<!--.*?-->", "", sprite, flags=re.S).strip()
    sprite = re.sub(r'^<svg[^>]*>', '<svg xmlns="http://www.w3.org/2000/svg" class="icon-sprite" aria-hidden="true">', sprite, count=1)
    mark = (ROOT / "brand" / "logo" / "mark.svg").read_text(encoding="utf-8")
    mark = re.sub(r"<title>.*?</title>", "", mark)
    mark = re.sub(r'\sfill="#[0-9A-Fa-f]{3,8}"', "", mark)
    mark = re.sub(r'<svg[^>]*>', '<svg class="pp-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">', mark, count=1)
    out = out.replace("<!--ICONS-->", sprite).replace("<!--MARK-->", mark)
    left = re.findall(r"\{\{[^}]*\}\}", out)
    if left:
        raise SystemExit(f"Не подставлено: {left[:5]}")
    OUT.write_text(out, encoding="utf-8")
    print("index.html собран:", len(out) // 1024, "КБ")


if __name__ == "__main__":
    main()
