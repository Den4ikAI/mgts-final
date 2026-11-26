# Данные сайта «Попутно»

Слой данных: `site/js/data/*.js`. Данные: `site/data/`. Сборки нет, нужен только статический HTTP-сервер
(`python3 -m http.server` из папки `site/`).

```
data/
  taxonomy.json        классы дефектов и русские подписи. ЕДИНСТВЕННЫЙ файл, который правим под классы организаторов
  basemap/             схема улиц для карты (GeoJSON, build.py), офлайн
  photos/              сюда кладём фото датасета, если результаты ссылаются на них по имени файла
  demo/                демо-набор (не датасет организаторов!), генерируется demo/generate.py
    meta.json objects.json detections.json events.json work_orders.json quality.json img/*.svg
    sample-import.csv  пример таблицы «разметка + ответ модели» для проверки импорта
```

## 1. Источник данных

| Источник | Как включить | Что делает |
|---|---|---|
| `demo` (по умолчанию) | `?source=demo` | читает `data/demo/*.json`. В данных `meta.demo = true`, `meta.note = «Демо-данные, не датасет организаторов»`, сайт обязан это показывать |
| `api` | `?source=api&api=http://localhost:8080` | ходит в Rust API (`/api/objects`, `/queue`, `/quality`, `/taxonomy`, `/auth/me`, SSE `/stream`). Токен из `localStorage['poputno.token']` |
| `file` | `?source=file` | пользователь перетаскивает в страницу файл результатов (+ фото, + таблицу разметки, + report.json). Всё хранится в IndexedDB браузера и переживает перезагрузку |

Выбор запоминается: `switchSource('file')` пишет `localStorage['poputno.source']`. Параметр в URL главнее.
Дополнительно: `?photos=./data/photos/` (папка фото для режима `file`), `?taxonomy=./data/taxonomy.json`.

Если API недоступно (Wi-Fi на площадке), `openSource()` открывает демо и ставит
`dataset.meta.fallbackFrom = 'api'`, `meta.fallbackReason`. Сайт должен показать плашку, демо не выдаётся за реальные данные.

Режим `api`: CORS у бэкенда разрешён, но refresh-cookie работает только с того же origin (сайт за тем же прокси, что `/api`).
С другого порта вход работает (`source.login(login, password)`), токен живёт 15 минут.

## 2. Таксономия: как заменить классы

Открыть `data/taxonomy.json`, заменить блок `classes`. Код не трогаем. Можно просто скопировать сюда
`ml/taxonomy.json` целиком: поля `severity` и `recommendation` необязательны.

```json
"classes": {
  "ok":         { "label": "Норма",        "kind": null,         "ok": true,  "aliases": ["норма", "исправен"] },
  "none":       { "label": "Объекта нет",  "kind": null,         "ok": true },
  "open_hatch": { "label": "Открытый люк", "kind": "cable_well", "ok": false,
                  "severity": "critical",
                  "recommendation": "Оградить проём и закрыть люк. Срок: {deadline}.",
                  "aliases": ["открытый люк", "отсутствует крышка"] }
}
```

- `label` русская подпись; `kind` `cable_well` | `dual_pole` | `null`; `ok: true` значит «не дефект».
- `aliases` все варианты написания из таблицы организаторов (регистр, ё/е, пробелы и знаки не важны).
- `severity` опасность по умолчанию (если модель её не дала): `low` | `medium` | `high` | `critical`.
- `recommendation` шаблон: `{label}`, `{deadline}` (по опасности: немедленно / 24 часа / 3 суток / плановое ТО, меняется в `ui.deadlines`), `{kind}`.
- Ключ `ok` и `none` лучше оставить: `ok` = норма, `none` = объект не виден (статус «Не наблюдается»).
- Неизвестный ключ показывается как есть, `null` показывается как «Норма». Метки разметки, которых нет в таксономии,
  попадают в отчёт импорта («Метки разметки без класса…») и в `quality.unmappedLabels`.

Таксономию можно и перетащить в страницу вместе с результатами (режим `file`): файл с полем `classes` распознаётся сам.

## 3. Формат импорта (режим `file`)

Перетащить можно любой из вариантов, по одному или вместе:

| Что | Как распознаётся |
|---|---|
| `results.json` (наш контракт, ниже) | `{"format": "poputno.results", "rows": [...]}` |
| `predictions.jsonl` из `ml/runs/<run>/` как есть | каждая строка JSON-объект |
| CSV / TSV / CSV через `;` / XLSX | первая строка заголовки; XLSX читается через SheetJS (`js/vendor/xlsx.full.min.js` или cdnjs) |
| JSON-массив строк | `[{...}, {...}]` |
| `report.json` из `ml/evaluate.py` | есть `confusion` / `per_class` → страница «Качество модели» |
| `taxonomy.json` | есть `classes` |
| COCO `{images, annotations, categories}` | рамки переводятся в доли кадра |
| фото `*.jpg/png/webp/svg` | сохраняются в браузере, сопоставляются по имени файла |

**Склейка:** если вместе брошены ответы модели и таблица разметки организаторов (без колонок модели),
строки склеиваются по имени фото (без расширения и регистра, как `ml/labels.py`): из разметки берутся
истинная метка, координаты, время, ID объекта из реестра (вместо `IMG-<файл>`).

### 3.1. Контракт `results.json` (версия 1)

Обязательно только: хотя бы одна строка. Чем больше полей, тем больше экранов оживает.

```json
{
  "format": "poputno.results",
  "version": 1,
  "run_id": "final",
  "model": "google/gemini-decision-1",
  "generated_at": "2026-11-26T12:30:00+03:00",
  "rows": [
    { "file": "img_001.jpg", "object_id": "ККС-0001", "lat": 55.7516, "lon": 37.7172, "kind": "cable_well",
      "truth": "открытый люк", "pred": "open_hatch", "confidence": 0.95, "severity": "critical", "route": "critical",
      "captured_at": "2026-11-26T10:42:00+03:00", "bbox": [0.30, 0.40, 0.20, 0.15],
      "rationale": "Открытый люк 95% · Норма 3% · опасность 2.7/3" },
    { "file": "img_002.jpg", "object_id": "ОДН-0002", "truth": "норма", "pred": null, "confidence": 0.91, "route": "auto_ok" }
  ]
}
```

| Поле | Тип | Смысл | Если нет |
|---|---|---|---|
| `file` | string | имя фото; фото ищется в перетащенных файлах, потом в `data/photos/<file>` | «нет кадра» |
| `media_uri` | string | готовая ссылка на фото (`/api/media/...`, `https://...`) | берётся `file` |
| `object_id` | string | ID объекта из реестра; несколько строк с одним ID = несколько проездов | `IMG-<имя файла без расширения>` |
| `lat`, `lon` | number | WGS84. Также `coordinates: "55.75, 37.71"` / `[55.75, 37.71]` / `POINT(lon lat)` | нет карты, только таблица |
| `kind` | string | `cable_well` / `dual_pole` / «колодец» / «опора» | по классу дефекта или префиксу ID (`MH`, `ККС` / `POLE`, `ОДН`) |
| `pred` | string \| null | ответ модели: ключ, русская метка или алиас из taxonomy.json; `null`/«норма» = дефекта нет; `none` = объект не виден | строка считается разметкой |
| `top` | string | самый вероятный класс модели (может быть `ok`), для матрицы ошибок | `pred` |
| `confidence` | 0..1 или «92%» | уверенность в `pred` | `probs[pred]`, потом `top_p` |
| `probs` | object | `{класс: вероятность}` для полосок вероятностей | |
| `severity` | `low`/`medium`/`high`/`critical` или «критическая», 0–4 | опасность | `severity` класса из taxonomy.json |
| `route` | `critical`/`review`/`auto_ok`/`not_observed`/`error` | маршрут кадра | дефект → `review` (`critical` при critical), норма → `auto_ok` |
| `truth` | string | разметка организаторов (вид повреждения) | нет страницы качества |
| `status` | string | статус из разметки: «исправен» / «проверка» / «ремонт» | |
| `captured_at` | ISO / «26.11.2026 10:42» / unix | время кадра; без зоны = московское | без времени, таймлайн без дат |
| `bbox` | `[x,y,w,h]` или `{x,y,w,h}` в долях кадра | рамка дефекта. В пикселях можно, если есть `image_width`/`image_height` | без рамки (весь кадр `[0,0,1,1]` тоже = без рамки) |
| `rationale` | string | объяснение модели в карточке | |
| `review_state` | `pending`/`confirm`/`reject`/`need_recapture` | уже принятое решение диспетчера | дефект ждёт решения |
| `address`, `district` | string | адрес, район (для таблицы районов) | |
| прочие поля | любые | сохраняются в `detection.extra`, в отчёте «колонки без сопоставления» | |

Правила статуса объекта те же, что в бэкенде (`projection.rs`): дефект в кадре → «Проверить»; подтверждение → «Дефект»;
отклонение без других ожидающих кадров → «Норма»; «нужен кадр» статус не меняет; закрытие наряда → «Норма».
«Критично» = «Проверить»/«Дефект» с опасностью `critical`. Кадр `not_observed` не меняет статус: объект без
наблюдений остаётся «Не наблюдается».

### 3.2. CSV

Те же поля колонками. Названия колонок узнаются по синонимам (ru/en, регистр и пробелы не важны), например:

| Поле | Примеры заголовков |
|---|---|
| file | file, filename, image, photo, path, файл, имя файла, фото, изображение, кадр |
| object_id | object_id, id, asset_id, номер, номер колодца, идентификатор, инв. номер |
| lat / lon | lat, latitude, широта / lon, lng, longitude, долгота; или одна колонка coordinates, координаты, gps |
| kind | object_type, kind, тип объекта, вид объекта (колонка `type`/`тип`: тип объекта, если значения «колодец/опора», иначе метка дефекта) |
| truth | label, gt, ground_truth, defect, damage, вид повреждения, тип дефекта, дефект, разметка, метка, класс |
| status | status, state, condition, статус, состояние, техническое состояние |
| pred | pred, prediction, predicted, pred_class, defect_type, класс модели, предсказание |
| confidence | confidence, conf, score, prob, уверенность, вероятность |
| severity | severity, danger, priority, опасность, критичность |
| captured_at | created_at, captured_at, timestamp, date, дата, время, дата съёмки |

Разделитель `,` `;` или табуляция определяется сам, десятичная запятая понимается (`0,95`, `55,7516`).
Колонка `defect_type` считается ответом модели, если в файле есть другие колонки модели (confidence, route, top_p, probs),
иначе это разметка. Если угадал не так, `importFiles(files, { mapping: { truth: 'Колонка' } })`.
Пример: `data/demo/sample-import.csv`.

После импорта `importFiles()` возвращает отчёт: какие колонки к чему привязаны, какие не узнаны,
какие метки не нашлись в таксономии, сколько строк склеено с разметкой. UI показывает его как есть.

## 4. Что выгрузить утром со стороны ML (5 минут)

**Вариант А, ноль кода.** После `worker.py` и `evaluate.py` перетащить на страницу (`?source=file`) одной пачкой:
`ml/runs/<run>/predictions.jsonl`, `ml/runs/<run>/report.json`, таблицу разметки организаторов в CSV
(XLSX тоже, если доступен интернет или лежит `js/vendor/xlsx.full.min.js`) и фото (можно всей папкой: папки обходятся рекурсивно).
Сайт склеит по имени файла, построит объекты, очередь, сводку и качество.

**Вариант Б, свой скрипт.** Если модель другая или нужны поля сверх worker.py, отдать `results.json` по контракту 3.1:

```python
import datetime as dt, json

def to_poputno(results, path="results.json", run_id="final", model="google/gemini-decision-1"):
    """results: список словарей с ответами модели (+ разметкой, если есть)."""
    rows = [{
        "file": r["file"],                       # имя фото
        "object_id": r.get("object_id"),         # ID из реестра; нет — сайт поставит IMG-<файл>
        "lat": r.get("lat"), "lon": r.get("lon"),
        "kind": r.get("kind"),                   # cable_well | dual_pole | «колодец» | «опора»
        "pred": r.get("defect_type"),            # ключ класса из taxonomy.json; None = норма; "none" = не виден
        "top": r.get("top"),
        "confidence": r.get("confidence"),       # 0..1
        "probs": r.get("probs"),
        "severity": r.get("severity"),           # low | medium | high | critical
        "route": r.get("route"),                 # critical | review | auto_ok | not_observed | error
        "truth": r.get("label"),                 # разметка организаторов, если есть
        "captured_at": r.get("captured_at"),
        "bbox": r.get("bbox"),                   # [x, y, w, h] в долях кадра
        "rationale": r.get("rationale"),
    } for r in results]
    doc = {"format": "poputno.results", "version": 1, "run_id": run_id, "model": model,
           "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "rows": rows}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

# из predictions.jsonl worker.py:
# to_poputno([json.loads(l) for l in open("ml/runs/final/predictions.jsonl") if l.strip()])
```

Фото: либо перетащить вместе с файлом, либо скопировать в `site/data/photos/` (имена как в `file`).
Можно вложить `"quality": <report.json>` и `"taxonomy": <taxonomy.json>` прямо в `results.json`.

Режим `api` не требует ничего: воркер пишет в Kafka, сайт читает API.

## 5. Демо-набор

`data/demo/` сгенерирован `python3 data/demo/generate.py` (детерминированно). 60 объектов в Лефортово, Перово,
Нижегородском, Текстильщиках, проезды 18–26.11.2026, все пять статусов, очередь из 12 кадров (3 критичных),
5 нарядов (2 закрыты с фото «после»), отчёт качества с круглыми демо-цифрами.
Адреса и координаты выдуманы на реальных улицах, фото заменены SVG-заглушками без текста внутри (ID, время и плашку «ДЕМО» рисует сам сайт).
Все файлы помечены `"demo": true` и «Демо-данные, не датасет организаторов». На защите их нельзя выдавать за результат.

## 6. Самопроверка

```
cd design2/site && python3 -m http.server 8765
# открыть http://localhost:8765/js/data/selftest.html → «N/N passed»
```
