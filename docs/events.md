# Контракт событий Kafka

Все сообщения — JSON-конверт:

```json
{ "event_id": "uuid v7", "occurred_at": "RFC3339", "key": "ключ партиции", "source": "кто отправил", "payload": { ... } }
```

Типы — в `backend/crates/domain/src/lib.rs` (источник истины).

| Топик | Кто пишет | Ключ | payload |
|---|---|---|---|
| `frames.ingested` | api (`POST /api/frames`), позже — машины | `frame_id` | `FrameIngested` |
| `frames.analyzed` | ML (`ml/consumer.py`) | `frame_id` | `FrameAnalyzed` |
| `frames.objects` | ML (`ml/boxes.py`) | `frame_id` | `FrameObjects` |
| `detections.created` | ML (`consumer.py`, `worker.py`) | `frame_id` | `DetectionCreated` |
| `object.events` | api | `object_id` | `ObjectEvent` (тег `type`) |

## Путь загруженного фото

```
POST /api/frames ─► S3 (frames/YYYY/MM/DD/<sha256>.jpg) ─► frames.ingested ─► ml/consumer.py
   ─► Gemini Decision ─► frames.analyzed (всегда) + detections.created (норма/дефект)
   ─► проекция: таблицы frames, detections, objects ─► SSE `frame_analyzed` ─► страница «Проверить фото»
```

Около 2 с от загрузки до вердикта. Повторная загрузка того же фото не вызывает модель: ответы кэшируются по sha256.

## `FrameObjects` (все объекты в кадре, второй этап)

Приходит через 5–8 с после вердикта, вердикт его не ждёт. Модель: Gemini 4 Hydrogen (чат-API, JSON со списком объектов);
Jev на один вопрос отдаёт ровно одну рамку, поэтому для нескольких объектов не подходит.

`frame_id`, `objects: [{ bbox: {x, y, w, h}, kind: tksh|rsh|null, condition: ok|paint|deformation|mount_failure, confidence, note }]`,
`model`, `latency_ms?`, `error?`. `bbox` — доли кадра 0..1, `x, y` — левый верхний угол (как `DetectionCreated.bbox`).

Для фронта: `GET /api/frames/{id}` отдаёт их в поле `objects`; live-поток шлёт `{key: frame_id, payload: {type: "frame_objects", ...}}`.
Рисовать: прямоугольник `left = x·W, top = y·H, width = w·W, height = h·H` поверх фото, цвет по `condition`
(ok — зелёный, paint — жёлтый, deformation — оранжевый, mount_failure — красный), подпись «ТКШ · Механическое повреждение», `note` в подсказке.

## `FrameIngested` (фото в хранилище)

`frame_id`, `source` (upload | vehicle | dataset), `image_uri` (`s3://bucket/key` или `file://…`), `media_uri` (`/api/media/store/<key>`),
`sha256`, `content_type`, `size_bytes`, `file_name`, `uploaded_by`, `object_id?`, `position?`, `captured_at?`, `vehicle_id?`, `heading?`.

## `FrameAnalyzed` (вердикт по каждому кадру)

`frame_id`, `route` (`auto_ok` | `review` | `critical` | `not_observed` | `error`), `object_kind?`, `defect_type?`, `severity?`,
`confidence`, `rationale?`, `detection_id?` (если ушёл `DetectionCreated`), `object_id?`, `position?` (из запроса или EXIF), `model`, `latency_ms?`, `error?`.

## `DetectionCreated` (выход ML)

| Поле | Тип | Примечание |
|---|---|---|
| `detection_id` | uuid | идемпотентность |
| `frame_id` | uuid | |
| `object_id` | string \| null | id из реестра МГТС, если сопоставлен |
| `object_kind` | `tksh` \| `rsh` \| `cable_well` \| `dual_pole` | |
| `position` | `{lat, lon}` \| null | |
| `defect_type` | string \| null | `null` = объект виден, дефекта нет |
| `severity` | `low` \| `medium` \| `high` \| `critical` \| null | |
| `confidence` | float 0..1 | |
| `bbox` | `{x, y, w, h}` 0..1 | |
| `crop_uri`, `rationale` | string \| null | доказательство для карточки |

## `ObjectEvent` (история объекта)

`observed`, `status_changed {from, to, reason}`, `reviewed {decision, reject_reason, reviewer}`,
`critical_alert_raised`, `work_order_opened`, `work_order_closed`.

Правила статусов сейчас простые (`projection.rs`): дефект в наблюдении → `suspected`, подтверждение диспетчера → `defect`,
отклонение без других ожидающих детекций → `ok`, закрытие наряда → `ok`. Голосование k из n проездов — следующий шаг.
