# Контракт событий Kafka

Все сообщения — JSON-конверт:

```json
{ "event_id": "uuid v7", "occurred_at": "RFC3339", "key": "ключ партиции", "source": "кто отправил", "payload": { ... } }
```

Типы — в `backend/crates/domain/src/lib.rs` (источник истины).

| Топик | Кто пишет | Ключ | payload |
|---|---|---|---|
| `frames.ingested` | загрузчик с машин | `vehicle_id` | `FrameIngested` |
| `detections.created` | ML-воркер | `frame_id` | `DetectionCreated` |
| `object.events` | api | `object_id` | `ObjectEvent` (тег `type`) |

## `DetectionCreated` (выход ML)

| Поле | Тип | Примечание |
|---|---|---|
| `detection_id` | uuid | идемпотентность |
| `frame_id` | uuid | |
| `object_id` | string \| null | id из реестра МГТС, если сопоставлен |
| `object_kind` | `cable_well` \| `dual_pole` | |
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
