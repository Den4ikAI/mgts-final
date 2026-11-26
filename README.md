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
docker compose up -d redpanda topics console postgres s3   # Kafka :19092, Kafka UI :8081, Postgres :5432, S3 :8333
cd backend && SEED_DEMO_USERS=1 S3_ENDPOINT=http://localhost:8333 S3_ACCESS_KEY=mgts S3_SECRET_KEY=mgts-secret \
  MEDIA_ROOT="$PWD/../data/Датасет-ДСС" cargo run -p api      # API :8080, демо-пользователи, бакет создаётся сам
cd ml && .venv/bin/python consumer.py                         # ML: слушает frames.ingested, отвечает frames.analyzed
cd ml && .venv/bin/python boxes.py                            # ML, второй этап: рамки всех ТКШ/РЩ в кадре → frames.objects
cd web && npm i && npm start                                  # UI :4200 (прокси /api -> :8080)
```

**Проверить фото** (`/check`, роли dispatcher, technician, admin): перетащить снимки → файл уходит в S3, событие в Kafka,
вердикт модели с рекомендацией бригаде приходит на страницу примерно через 2 с. Весь датасет тем же путём:
`cd ml && .venv/bin/python upload.py ../data/Датасет-ДСС --labels ../data/Датасет-ДСС/labels.csv --id-col object_id`.

**Датасет организаторов:** `POST /api/datasets` (поле `archive`, можно несколько zip). Разметка ищется в xlsx/csv внутри архива,
тип ТКШ/РЩ берётся из имени папки. Прогресс и качество прогона: `GET /api/datasets/{id}`. Таблица для жюри (объект, вывод,
вид повреждения, опасность, рекомендация, сверка с разметкой): `GET /api/frames/export?batch=<id>&format=xlsx|csv`.

Фото лежат в S3 (локально SeaweedFS, в проде любой S3), в базе и Kafka только ссылки. Без `S3_ENDPOINT` API кладёт
загрузки в папку `UPLOAD_DIR` (`../data/uploads`). Фото датасета отдаются с диска из `MEDIA_ROOT`.

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

Swagger UI: **http://localhost:8080/api/docs**, схема OpenAPI 3.1: `/api/openapi.json`. Схема генерируется из кода обработчиков (utoipa), тест `openapi::tests` падает, если маршрут не описан. Войти: `POST /api/auth/login` (`dispatcher` / `mgts-demo`), вставить `access_token` в **Authorize**.

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
