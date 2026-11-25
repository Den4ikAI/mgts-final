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
| ML | Python-воркер на Gemini Decision (OpenRouter), пишет в Kafka | [`ml/`](ml/README.md) |
| Дизайн | Claude Design, дизайн-система «МГТС Инфраструктура» | `design/`, [`docs/design.md`](docs/design.md) |

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
cd backend && SEED_DEMO_USERS=1 cargo run -p api       # API :8080, демо-пользователи
cd web && npm i && npm start                            # UI :4200 (прокси /api -> :8080)
```

Всё в контейнерах: `docker compose up -d --build`.

Демо-вход (`SEED_DEMO_USERS=1`, пароль `mgts-demo`): `admin`, `dispatcher`, `manager`, `tech`. Роли и токены: [`docs/auth.md`](docs/auth.md).

Без ML можно накидать тестовые детекции (нужен токен админа):

```bash
TOKEN=$(curl -s localhost:8080/api/auth/login -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"mgts-demo"}' | jq -r .access_token)
curl -XPOST localhost:8080/api/dev/detections -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"object_id":"KK-0001","lat":55.751,"lon":37.618,"defect_type":"open_hatch","severity":"critical","rationale":"Крышка смещена, виден проём"}'
```

## API

Всё под `/api`, кроме входа, требует `Authorization: Bearer <access_token>`. Подробно: [`docs/auth.md`](docs/auth.md).

| Метод | Путь | Что | Право |
|---|---|---|---|
| POST | `/api/auth/login` | вход → access-токен + refresh-cookie | — |
| POST | `/api/auth/refresh` | ротация refresh, новый access | refresh-cookie |
| POST | `/api/auth/logout` · `/logout-all` | выход из сессии · со всех устройств | — · любой |
| GET | `/api/auth/me` | текущий пользователь и его права | любой |
| POST | `/api/auth/stream-ticket` | билет на 60 с для SSE | `objects_read` |
| GET/POST/PATCH | `/api/users`, `/api/users/{id}` | пользователи, роли, отключение | `users_manage` |
| GET | `/api/objects?status=&kind=` | реестр объектов со статусами | `objects_read` |
| GET | `/api/objects/{id}` | объект + последние детекции | `objects_read` |
| GET | `/api/objects/{id}/history` | история событий объекта | `objects_read` |
| POST | `/api/objects/{id}/reviews` | решение диспетчера (`confirm` / `reject` / `need_recapture`) → Kafka; автор берётся из токена | `review` |
| GET | `/api/queue` | очередь разбора, критичные первыми | `objects_read` |
| GET | `/api/stats` | счётчики по статусам | `stats_read` |
| GET | `/api/stream?ticket=` | SSE с живыми событиями | билет |
| POST | `/api/dev/detections` | тестовая детекция (выключается `DEV_ENDPOINTS=0`) | `dev_tools` |
