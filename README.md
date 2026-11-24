# МГТС · Кейс 3 «Сетевая инфраструктура»

Мониторинг кабельных колодцев и опор двойного назначения по камерам служебных машин.
Единица анализа — **объект во времени**, а не кадр: каждый объект имеет историю событий в Kafka.

## Стек

| Часть | Технологии | Папка |
|---|---|---|
| API + проекция событий | Rust, axum, rdkafka, sqlx | `backend/` |
| Веб-интерфейс | Angular 20 (standalone, zoneless, signals) | `web/` |
| Журнал событий | Kafka (локально Redpanda) | `docker-compose.yml` |
| Read-модель | Postgres | `backend/migrations/` |
| ML | Python-воркер, общается только через Kafka | _в работе_ |
| Дизайн | Claude Design | ссылка в `docs/design.md` |

## Архитектура

```
машины ─► frames.ingested ─► [ML-воркер] ─► detections.created ─┐
                                                                 ▼
             Angular ◄─ REST/SSE ─ [api: Rust] ◄── проекция ── object.events (история объекта)
                                       │  ▲                        ▲
                                       ▼  └── Postgres (read)      │
                                       └─── ревью диспетчера ──────┘
```

* `object.events` — источник истины, ключ = `object_id`, бессрочное хранение. Postgres восстанавливается переигрыванием топика.
* У объекта три состояния плюс промежуточное: `ok`, `suspected`, `defect`, `not_observed` («честное не знаю» — снег, перекрытие).
* Критичный дефект (`severity = critical`) сразу даёт событие `critical_alert_raised`, без ожидания очереди.

Контракт событий: [`docs/events.md`](docs/events.md).

## Запуск

```bash
docker compose up -d redpanda topics console postgres   # Kafka :19092, Kafka UI :8081, Postgres :5432
cd backend && cargo run -p api                          # API :8080
cd web && npm i && npm start                            # UI :4200 (прокси /api -> :8080)
```

Всё в контейнерах: `docker compose up -d --build`.

Без ML можно накидать тестовые детекции:

```bash
curl -XPOST localhost:8080/api/dev/detections -H 'Content-Type: application/json' \
  -d '{"object_id":"KK-0001","lat":55.751,"lon":37.618,"defect_type":"open_hatch","severity":"critical","rationale":"Крышка смещена, виден проём"}'
```

## API

| Метод | Путь | Что |
|---|---|---|
| GET | `/api/objects?status=&kind=` | реестр объектов со статусами |
| GET | `/api/objects/{id}` | объект + последние детекции |
| GET | `/api/objects/{id}/history` | история событий объекта |
| POST | `/api/objects/{id}/reviews` | решение диспетчера (`confirm` / `reject` / `need_recapture`) → Kafka |
| GET | `/api/queue` | очередь разбора, критичные первыми |
| GET | `/api/stats` | счётчики по статусам |
| GET | `/api/stream` | SSE с живыми событиями |
| POST | `/api/dev/detections` | тестовая детекция (выключается `DEV_ENDPOINTS=0`) |
