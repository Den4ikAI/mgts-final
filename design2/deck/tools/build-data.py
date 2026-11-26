#!/usr/bin/env python3
"""Заполняет deck/numbers.json цифрами прогона и кладёт фото датасета в deck/assets/photos/.

Источник: ml/runs/<run>/ (report.json, summary.json, predictions.jsonl, mistakes.csv)
и data/Датасет-ДСС/labels.csv. ML-код не вызывается, только читаются его результаты.

  python3 deck/tools/build-data.py [--run dss-final2]
  python3 deck/tools/inline-numbers.py        # вклеить numbers.json в index.html

Фото датасета организаторов: только для показа на защите. В публичный репозиторий не класть.
"""
import argparse
import csv
import json
import time
from pathlib import Path

from PIL import Image, ImageOps

DECK = Path(__file__).resolve().parent.parent
REPO = DECK.parent.parent
NUMBERS = DECK / "numbers.json"
PHOTOS = DECK / "assets" / "photos"
DATA = REPO / "data" / "Датасет-ДСС"

KIND = {"tksh": "ТКШ", "rsh": "РЩ"}
LABEL = {"ok": "Удовлетворительно", "paint": "Повреждение ЛКП", "deformation": "Механическое повреждение",
         "mount_failure": "Нарушение крепления", "none": "Объекта нет"}
STATE = {"ok": "Норма", "paint": "Коррозия, ЛКП", "deformation": "Деформация, МП", "mount_failure": "Нарушение крепления"}
SHORT = {"ok": "Норма", "paint": "ЛКП", "deformation": "МП", "mount_failure": "Крепление", "none": "Нет объекта"}
# Сквозной пример и строки перечня на слайде «Продукт»: реальные строки predictions.jsonl
EXAMPLE = "ТКШ-36955095"
# Галерея на слайде «Данные»: по одному реальному фото на класс разметки
GALLERY = [("ok", "ТКШ-97363015"), ("paint", "ТКШ-20251015"), ("deformation", "РЩ-35453689"), ("mount_failure", "ТКШ-39104955")]
REGISTRY = ["ТКШ-36955095", "РЩ-35453689", "ТКШ-31093053", "ТКШ-20251015", "РЩ-29159065",
            "ТКШ-26224137", "ТКШ-97363015", "РЩ-20195471"]
# Варианты промпта: таблица из ml/README.md (experiment.py, variants/)
VARIANTS = [
    {"name": "Gemini Decision, настроенный промпт, 2048 px", "acc": "91,8 %", "cost": "$0,014", "out": "взяли", "chosen": True},
    {"name": "Gemini Decision, первый промпт", "acc": "90,2 %", "cost": "$0,011", "out": "хуже находит перекос климатического отсека"},
    {"name": "Gemini 4 Neon, обычная чат-модель", "acc": "88,5 %", "cost": "$1,05", "out": "нет вероятностей, в 75 раз дороже; пишет описание, читает координаты с фото"},
    {"name": "Эталонные фото в запросе, few-shot", "acc": "−4…−8 п.п.", "cost": "×5", "out": "модель путает эталон с проверяемым фото"},
    {"name": "Обрезка по рамке перед классификацией", "acc": "85,2 %", "cost": "", "out": "без опоры в кадре не видно отрыва"},
    {"name": "TypeSafe Jev 1.14", "acc": "73,8 %", "cost": "$0,013", "out": "слабее как классификатор, годится для рамок"},
]


# Рамки объектов: data/crops/boxes.jsonl (ml/crop.py, модель TypeSafe Jev), доли кадра.
# Проверены глазами на каждом фото деки; где рамка мимо объекта, поправлено вручную ниже.
BOXES_FILE = REPO / "data" / "crops" / "boxes.jsonl"
BOX_FIX = {
    "МП. ТКШ/36955095.png": {"top": 0.33, "bottom": 0.52, "left": 0.55, "right": 0.70},   # шкаф целиком, а не только верх
    "МП. ТКШ/26224137.jpg": {"top": 0.20, "bottom": 0.80, "left": 0.01, "right": 0.93},   # климатический отсек внизу тоже
    "МП.РЩ/36957664.jpg": {"top": 0.56, "bottom": 0.79, "left": 0.37, "right": 0.58},     # раскрытый РЩ, а не ТКШ над ним
}
# Цвет рамки по виду неисправности: крепление и МП красные, ЛКП жёлтая, норма нейтральная
FRAME = {"mount_failure": "critical", "deformation": "critical", "paint": "suspected", "ok": "", "none": ""}
TAG = {"mount_failure": "Нарушение крепления", "deformation": "Механическое повреждение", "paint": "Повреждение ЛКП",
       "ok": "Норма", "none": "Объекта нет"}


def load_boxes():
    out = {}
    if BOXES_FILE.exists():
        for line in BOXES_FILE.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["rel"]] = r["box"]
    out.update(BOX_FIX)
    return out


BOXES = {}


def framed(p, ar, width, pad, tag):
    """Кадр под слот ar = ширина/высота: объект в центре с полями pad (доля размера рамки),
    None = максимальный кадр с объектом. Возвращает файл и рамку в долях этого кадра."""
    im = ImageOps.exif_transpose(Image.open(DATA / p["rel"])).convert("RGB")
    W, H = im.size
    b = BOXES.get(p["rel"]) or {"top": 0.08, "bottom": 0.92, "left": 0.08, "right": 0.92}
    l, r, t, bt = b["left"] * W, b["right"] * W, b["top"] * H, b["bottom"] * H
    bw, bh = r - l, bt - t
    if pad is None:
        cw = min(W, H * ar)
    else:
        cw = max(bw * (1 + 2 * pad), bh * (1 + 2 * pad) * ar)
    ch = cw / ar
    s = min(1.0, W / cw, H / ch)
    cw, ch = cw * s, ch * s
    x0 = min(max((l + r) / 2 - cw / 2, 0), W - cw)
    y0 = min(max((t + bt) / 2 - ch / 2, 0), H - ch)
    crop = im.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch)))
    crop = crop.resize((width, round(width / ar)), Image.LANCZOS)
    kind, num = ("tksh" if p["object_id"].startswith("ТКШ") else "rsh"), p["object_id"].split("-", 1)[1]
    name = f"{kind}-{num}-{tag}.jpg"
    crop.save(PHOTOS / name, "JPEG", quality=82, optimize=True)
    cl = lambda v: round(min(max(v, 0.0), 1.0), 4)
    bx, by = cl((l - x0) / cw), cl((t - y0) / ch)
    top = p.get("top") or "none"
    return {"img": name, "box": {"x": bx, "y": by, "w": round(cl((r - x0) / cw) - bx, 4), "h": round(cl((bt - y0) / ch) - by, 4)},
            "cls": FRAME.get(top, ""), "tag": TAG.get(top, ""), "p": f"{p['top_p']:.2f}"}


def status_of(p):
    """Итог для перечня: маршрут модели → статус бренда (как в брендбуке)."""
    r, top = p["route"], p.get("top")
    if r == "critical":
        return "critical"
    if r == "auto_ok":
        return "ok"
    if r == "not_observed":
        return "not_observed"
    return "suspected" if top in ("ok", None) else "defect"


def recommendation(p):
    st, top = status_of(p), p.get("top")
    if st == "critical":
        return "Срочный выезд: закрепить шкаф, оградить зону" if top == "mount_failure" else "Срочный выезд: корпус открыт или разрушен"
    if st == "ok":
        return "Ремонт не нужен"
    if st == "not_observed":
        return "Нужно новое фото"
    if st == "suspected":
        return "Диспетчер смотрит фото"
    return "Ремонт корпуса в ближайший выезд" if top == "deformation" else "Зачистка и покраска в плановое ТО"


def verdict(p):
    st = status_of(p)
    return {"ok": "в норме", "critical": "повреждён", "defect": "повреждён"}.get(st, "проверить")


def photo(p, size=960):
    """Уменьшенная копия фото: assets/photos/<tksh|rsh>-<номер>.jpg"""
    kind, num = ("tksh" if p["object_id"].startswith("ТКШ") else "rsh"), p["object_id"].split("-", 1)[1]
    name = f"{kind}-{num}.jpg"
    out = PHOTOS / name
    if not out.exists():
        im = ImageOps.exif_transpose(Image.open(DATA / p["rel"])).convert("RGB")
        im.thumbnail((size, size))
        im.save(out, "JPEG", quality=80, optimize=True)
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="dss-final2")
    a = ap.parse_args()
    run = REPO / "ml" / "runs" / a.run
    rep = json.loads((run / "report.json").read_text(encoding="utf-8"))
    preds = {}
    for line in (run / "predictions.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            p = json.loads(line)
            preds[p["object_id"]] = p
    by_rel = {p["rel"]: p for p in preds.values()}
    labels = list(csv.DictReader((DATA / "labels.csv").open(encoding="utf-8")))
    truth = {r["file"]: r for r in labels}
    PHOTOS.mkdir(parents=True, exist_ok=True)
    for old in PHOTOS.glob("*.jpg"):
        old.unlink()
    BOXES.update(load_boxes())

    n = json.loads(NUMBERS.read_text(encoding="utf-8"))
    ph = n["placeholders"]

    def put(key, value, unit=None, desc=None, source=None):
        e = ph.setdefault(key, {})
        e["value"] = value
        if unit is not None: e["unit"] = unit
        if desc is not None: e["desc"] = desc
        if source is not None: e["source"] = source

    pct1 = lambda x: f"{x * 100:.1f}".replace(".", ",")
    src = f"ml/runs/{a.run}/report.json"
    counts = {}
    for r in labels:
        counts[r["class"]] = counts.get(r["class"], 0) + 1
    mtime = time.strftime("%d.%m %H:%M", time.localtime((run / "report.json").stat().st_mtime))

    # датасет
    put("dataset.images", rep["images"], "фото", "Фото в датасете ДСС", src + " images")
    put("dataset.labeled", rep["evaluated"], "фото", "Фото с разметкой", src + " evaluated")
    put("dataset.classes", [LABEL[k] for k in ("ok", "paint", "deformation", "mount_failure")], "список", "Классы разметки", "labels.csv")
    for k, key in (("paint", "count_paint"), ("deformation", "count_deformation"), ("mount_failure", "count_mount"), ("ok", "count_ok")):
        put("dataset." + key, counts.get(k, 0), "фото", f"Фото класса {LABEL[k]} в разметке", "labels.csv")
    put("dataset.has_coordinates", False, "да/нет", "Координат в разметке нет, ID по имени файла", "labels.csv")
    put("dataset.has_object_ids", False, "да/нет", "Колонки ID нет: ID = тип + номер файла", "labels.csv")
    # прогон
    put("run.id", a.run, "текст", "Прогон", "ml/runs")
    put("run.date", mtime, "дд.ММ ЧЧ:мм", "Время отчёта прогона", src + " mtime")
    put("run.model", rep["model"], "текст", "Модель", src)
    put("run.evaluated", rep["evaluated"], "фото")
    put("run.no_label", rep["no_label"], "фото")
    put("run.api_errors", rep["api_errors"], "фото")
    put("run.wall_s", 20, "с", "Весь датасет через продукт: архив → S3 → Kafka → модель", "Пайплайн решения (PDF команды): «около 20 секунд»")
    put("run.cost_rub", "1,5", "₽", "Весь датасет в рублях", "Пайплайн решения (PDF команды): «≈1,5 ₽»")
    put("run.e2e_s", 2, "с", "От загрузки до вердикта", "Пайплайн решения (PDF команды): «≈2 с от загрузки до вердикта»")
    put("run.cost_usd", f"{rep['cost_usd']:.3f}".replace(".", ","), "$", "Стоимость прогона всего датасета", src + " cost_usd")
    put("run.cost_per_image_usd", f"{rep['cost_usd'] / rep['images']:.5f}".replace(".", ","), "$", "Цена одного фото", "cost_usd / images")
    put("run.avg_latency_s", f"{rep['avg_latency_s']:.1f}".replace(".", ","), "с", "Ответ модели на фото", src + " avg_latency_s")
    put("run.max_side_px", 2048, "px", "Длинная сторона фото, отправляемого в модель", "ml/README.md, прогон dss-final2")
    # метрики
    tot, miss = rep["defects_total"], rep["defects_missed"]
    put("metrics.defects_total", tot, "дефектов", source=src)
    put("metrics.defects_missed", miss, "дефектов", source=src)
    put("metrics.defects_reached_human", tot - miss, "дефектов", source=src)
    put("metrics.defect_recall", round(rep["defect_recall"] * 100), "%", source=src)
    mount = [p for r, p in by_rel.items() if truth.get(r, {}).get("class") == "mount_failure"]
    put("metrics.critical_total", len(mount), "фото", "Нарушение крепления по разметке", "labels.csv")
    put("metrics.critical_reached_human", sum(p["route"] in ("review", "critical") for p in mount), "фото", "Крепление: дошли до человека", "predictions.jsonl")
    put("metrics.recall_critical", round(100 * sum(p["route"] in ("review", "critical") for p in mount) / max(1, len(mount))), "%", "Крепление: доля у человека", "predictions.jsonl")
    put("metrics.critical_routed_alarm", sum(p["route"] == "critical" for p in mount), "фото", "Крепление: тревога вне очереди", "predictions.jsonl")
    put("metrics.accuracy", pct1(rep["accuracy"]), "%", "Вид повреждения верно", src + " accuracy")
    put("metrics.macro_f1", f"{rep['macro_f1']:.3f}".replace(".", ","), "0..1", source=src)
    put("metrics.false_alarm_rate", round(rep["false_alarm_rate"] * 100), "%", source=src)
    put("metrics.auto_share", round(rep["auto_share"] * 100), "%", source=src)
    put("metrics.auto_precision", round(rep["auto_precision"] * 100), "%", source=src)
    put("metrics.to_humans_share", round(rep["to_humans_share"] * 100), "%", source=src)
    put("metrics.kind_accuracy", round(rep["kind_accuracy"] * 100), "%", "Тип ТКШ/РЩ верно", src + " kind_accuracy")
    put("metrics.errors", sum(1 for _ in csv.DictReader((run / "mistakes.csv").open(encoding="utf-8"))), "фото", "Ошибки вида повреждения", "mistakes.csv")
    for k, v in rep["routes"].items():
        put("routes." + k, v, "фото", source=src)
    th = rep["thresholds"]
    for k in ("auto_ok", "object_min", "critical_prob", "check_max"):
        put("thresholds." + k, str(th[k]).replace(".", ","), "0..1", source=src + " thresholds")
    # перебор порога
    rows = [{"auto_ok": r["auto_ok"], "auto_share": r["auto_share"], "defects_missed": r["defects_missed"]} for r in rep["threshold_sweep"]]
    put("sweep.rows", rows, "массив", source=src + " threshold_sweep")
    ch = next(r for r in rep["threshold_sweep"] if abs(r["auto_ok"] - th["auto_ok"]) < 1e-9)
    alt = max((r for r in rep["threshold_sweep"] if r["auto_ok"] < th["auto_ok"]), key=lambda r: r["auto_ok"])
    put("sweep.chosen_threshold", str(ch["auto_ok"]).replace(".", ","), "0..1", source=src)
    put("sweep.chosen_auto_share", round(ch["auto_share"] * 100), "%", source=src)
    put("sweep.chosen_defects_missed", ch["defects_missed"], "дефектов", source=src)
    put("sweep.alt_threshold", str(alt["auto_ok"]).replace(".", ","), "0..1", source=src)
    put("sweep.alt_auto_share", round(alt["auto_share"] * 100), "%", source=src)
    put("sweep.alt_defects_missed", alt["defects_missed"], "дефектов", source=src)

    # сквозной пример
    ex = preds[EXAMPLE]
    put("example.file", photo(ex), "имя файла", "Сквозной пример: шкаф держится на кабеле", ex["rel"])
    put("example.object_id", ex["object_id"], "ID", source="predictions.jsonl")
    put("example.defect_label", LABEL[ex["top"]], "текст", source="predictions.jsonl")
    put("example.truth_label", truth[ex["rel"]]["description"].strip(), "текст", source="labels.csv")
    put("example.confidence", f"{ex['top_p']:.2f}", "0..1", source="predictions.jsonl top_p")
    put("example.route", ex["route"], "ключ", source="predictions.jsonl")
    put("example.severity_prob", round(ex["p_critical"] * 100), "%", source="predictions.jsonl p_critical")
    put("example.pain", framed(ex, 760 / 570, 1280, 0.55, "pain"), "кадр", "Фото примера с рамкой для слайда «Боль»", "boxes.jsonl + ручная правка")
    put("example.cv", framed(ex, 440 / 600, 880, 0.45, "cv"), "кадр", "Фото примера с рамкой для слайда CV", "boxes.jsonl + ручная правка")
    put("example.answers", {
        "object_p": round(ex["object_p"], 3), "kind": KIND[ex["kind"]],
        "probs": [[LABEL[k], round(ex["probs"].get(k, 0), 3)] for k in ("mount_failure", "deformation", "paint", "ok")],
        "p_critical": round(ex["p_critical"], 3),
        "checks": [[SHORT[k], round(v, 3)] for k, v in ex.get("checks", {}).items()],
    }, "объект", "Ответы модели на вопросы о фото примера", "predictions.jsonl")

    # перечень на слайде «Продукт»
    reg = []
    for oid in REGISTRY:
        p = preds[oid]
        st = status_of(p)
        state = {"not_observed": "Шкаф виден плохо", "suspected": "Похоже на норму"}.get(st, STATE.get(p["top"], ""))
        reg.append({"id": oid, "kind": KIND[p["kind"]], "state": state, "status": st,
                    "verdict": verdict(p), "rec": recommendation(p), "conf": f"{p['top_p']:.2f}",
                    "img": framed(p, 92 / 62, 240, 0.25, "t"), "truth": LABEL.get(truth.get(p["rel"], {}).get("class"), "")})
    put("product.rows", reg, "массив", "Строки перечня, реальные ответы модели", "predictions.jsonl")
    put("product.total", len([p for p in preds.values() if p["rel"] in truth]), "объектов", "Объектов в перечне", "predictions.jsonl")

    # галерея классов для слайда «Данные»
    gal = []
    for cls, oid in GALLERY:
        p = preds[oid]
        g = framed(p, 340 / 470, 720, 0.30, "g")
        g.update({"cls_key": cls, "label": STATE[cls], "id": oid, "count": counts.get(cls, 0)})
        gal.append(g)
    put("data.gallery", gal, "массив", "По одному фото на класс разметки, с рамкой", "predictions.jsonl + boxes.jsonl")
    kinds = {"tksh": 0, "rsh": 0}
    for r in labels:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    put("dataset.count_tksh", kinds["tksh"], "фото", "Фото ТКШ в разметке", "labels.csv kind")
    put("dataset.count_rsh", kinds["rsh"], "фото", "Фото РЩ в разметке", "labels.csv kind")
    put("example.site", framed(ex, 560 / 420, 1120, 0.6, "s"), "кадр", "Фото примера для слайда «Решение»", "boxes.jsonl + ручная правка")

    # A1
    cf = rep["confusion"]
    idx = [cf["labels"].index(k) for k in ("ok", "paint", "deformation", "mount_failure")]
    put("a1.confusion", {"names": [cf["names"][i] for i in idx], "matrix": [[cf["matrix"][i][j] for j in idx] for i in idx]}, "матрица", source=src)
    put("a1.per_class", rep["per_class"], "объект", source=src)
    put("a1.top_confusion_pair", "деформацию с нормой", "текст", source=src + " confusion: МП → Удовлетворительно 2")
    # A2: все ошибки
    mist = []
    for r in csv.DictReader((run / "mistakes.csv").open(encoding="utf-8")):
        p = by_rel[r["file"]]
        mist.append({"id": p["object_id"], "truth": r["truth"], "predicted": r["predicted"], "p": r["p"],
                     "route": r["route"], "desc": r["truth_desc"].strip(), "img": framed(p, 316 / 400, 640, 0.45, "m")})
    put("a2.mistakes", mist, "массив", source=f"ml/runs/{a.run}/mistakes.csv")
    put("a3.variants", VARIANTS, "массив", source="Пайплайн решения (PDF команды), раздел «Что пробовали»; ml/experiment.py")
    # устаревшие ключи старой предметки
    for k in ("a2.missed_examples", "limits.example_files", "example.lat", "example.lon", "example.severity_label",
              "example.defect_prob", "example.rationale", "run.wall_min", "dataset.has_repeat_passes", "dataset.class_counts"):
        ph.pop(k, None)

    n["_about"]["fill_by"] = f"Заполнено tools/build-data.py из ml/runs/{a.run}, {mtime}"
    NUMBERS.write_text(json.dumps(n, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    nulls = [k for k, v in ph.items() if v.get("value") is None]
    print("numbers.json: пустых ключей", len(nulls), nulls)
    print("фото:", len(list(PHOTOS.glob("*.jpg"))))


if __name__ == "__main__":
    main()
