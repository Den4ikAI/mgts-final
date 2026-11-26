# Попутно · мобильный и desktop клиент (KMP)

Kotlin Multiplatform + Compose Multiplatform, таргеты **Android, iOS, Desktop (JVM)**.
Навигация Decompose, состояние MVI, clean architecture, ручной DI (`core:di`).
Дизайн-система — Kotlin-порт бренда «Попутно» из `../design2/brand` (токены, шрифты, иконки), **без Material**.

## Модули

```
core/            инфраструктура, ничего не знает о предметной области
  common         Outcome, AppError
  di             графы: single / factory / ClosableGraph / SessionContributor
  mvi            Store, MviStore (InstanceKeeper), retainedStore
  permissions    разрешения (камера): Android Activity Result, iOS AVFoundation, desktop granted;
                 статус перечитывается на ON_RESUME (вернулся из настроек — камера открылась)
  network        Ktor: bearer + ротируемый refresh (cookie mgts_refresh), JSON snake_case, apiCall → Outcome
  designsystem   токены, тема, адаптив, компоненты, иконки, шрифты
common/          общее для ролей
  domain         модели, контракты репозиториев, общие юзкейсы (правило маршрута)
  data           сервер по OpenAPI (api/openapi.json): вход, очередь, решения, объекты, таксономия,
                 выгрузка кадров, пользователи; локально — наряды и бригады (в API их нет) + DataGraph
  ui             переходы стека, появление, свайпы, адаптивный каркас, маппинг домен → UI
  camera         флоу съёмки (MVI) + общий оверлей; превью/снимок через expect/actual
feature/         по роли, внутри всегда domain / data / di / presentation
  auth           вход, демо-вход по роли
  dispatcher     очередь проверки кадров (свайп: дефект / норма), деталь
  manager        руководитель: входящие дефекты → наряд → бригада → приёмка
  brigade        наряды бригады: список → наряд → камера «до/после»
  admin          пользователи и роли, порог автозакрытия модели
shared           AppGraph + SessionGraph, RootComponent, App()
androidApp, desktopApp, (iOS: shared.framework → MainViewController())
```

Правило зависимостей: `feature → common:{domain,ui} → core`. Фича не видит `common:data`:
граф фичи получает только свой `*Deps`-интерфейс, его реализует `SessionGraph`.

## Дизайн-система (`core:designsystem`)

- **Токены в два слоя**, как в `tokens.css`: `PpPalette` (примитивы) → `PpColors` (семантика, dark/light).
  В UI только `Pp.colors.*`, `Pp.type.*`, `Pp.space.*`, `Pp.radii.*`, `Pp.motion.*`.
- **Адаптив по ширине окна, а не по платформе** (`PpAdaptive`): Compact < 600 dp (док-капсула снизу),
  Medium (rail), Expanded ≥ 1024 (сайдбар, список + деталь), Large ≥ 1440 (весь UI укрупняется до ×1.25
  через density). Кегли display/h1/kpi «жидкие» между 360 и 1440 dp, как `clamp()`.
  Отступы страницы, число колонок сетки, ширина контента берутся из класса.
- **Без Material**: свои `PpIndication` (без ripple), `PpText`, `LocalContentColor`. Фирменный приём —
  уголки рамки детекции (`Modifier.detectionCorners`): выбранная карточка, прицел камеры, фото.
- Шрифты Unbounded / Golos Text / JetBrains Mono в compose-ресурсах, иконки — `PpIcons`
  (генерируются `tools/gen_icons.py` из SVG бренда).

## Движение

Три характера переходов вместо одного «свайпа вправо» (`common:ui/motion/StackMotion.kt`):
`routeShift` (соседние экраны, короткий сдвиг + фейд), `frameReveal` (деталь раскрывается из
скруглённой рамки), `sheetRise` (камера поднимается, фон уходит в глубину). Плюс stagger-появление
списков (`Modifier.appear`), свайп-действия очереди, «перефокус» при смене вкладки.
Всё через `graphicsLayer` (transform/alpha/clip): прерывание жестом назад не ломает кадр.
`PpMotion.Reduced` обнуляет сдвиги и масштаб.

## Производительность

- анимированные значения читаются в draw-фазе (`graphicsLayer {}`, `drawWithContent`, лямбды), без рекомпозиции на кадр;
- `@Immutable`-состояния, `compose-stability.conf` для доменных моделей, ключи и `contentType` в ленивых списках;
- Store переживает смену конфигурации (InstanceKeeper), граф фичи создаётся лениво только для своей роли;
- CameraX: `PreviewView.PERFORMANCE` (SurfaceView), `CAPTURE_MODE_MINIMIZE_LATENCY`, запись на отдельном executor;
  iOS: `startRunning` вне main-потока;
- отчёты компилятора Compose: `./gradlew :feature:dispatcher:compileKotlinDesktop -PcomposeReports`.

## Камера бригады

Наряд → «До»/«После» → три шага на линии маршрута: Общий план → Крупно → Номер.
Прицел: рамка из уголков «дышит», по ней идёт сканирующая линия; на снимке вспышка и уголки
защёлкиваются зелёным. Затвор — знак «Попутно» (уголки сжимаются к точке при нажатии).
Кадр → «Переснять / Кадр принят» → итог → «Прикрепить к наряду». Закрыть наряд без трёх кадров «после» нельзя.
Разрешение — `core:permissions`, с экраном-объяснением и переходом в настройки после отказа.

## Сервер и фото

- Адрес API по умолчанию — стенд `http://87.242.101.125:25565` (`STAND_BASE_URL` в `core:network`).
  Другой — поле «Сервер» на экране входа; desktop — переменная `POPUTNO_API`;
  локальный API с эмулятора — `http://10.0.2.2:8080`.
- Демо-вход по роли берёт учётки стенда (`admin`, `dispatcher`, `manager`, `tech` / `mgts-demo`).
- Фото (`crop_uri`, `media_uri` → `/api/media/...`) грузит Coil 3 тем же Ktor-клиентом (Bearer).
  Декодирование под размер на экране, кэш памяти 20 % и диск 256 МБ. Рамка детекции — по `bbox`
  от фактического прямоугольника фото.
- Решения диспетчера: `POST /api/objects/{id}/reviews` (confirm / reject + причина-метка / need_recapture),
  оптимистичное удаление из очереди с откатом при ошибке. Очередь обновляется каждые 15 с.
- Кадры бригады уходят в `POST /api/frames` через очередь выгрузки (ключ: наряд + этап + шаг).
- Наряды и бригады пока локальные: в API есть права `work_orders_*`, но нет эндпоинтов.

## Команды

```bash
./gradlew :desktopApp:run                      # desktop
./gradlew :androidApp:assembleDebug            # APK
./gradlew :shared:compileKotlinIosSimulatorArm64   # проверка iOS-кода (линковка framework — на macOS)
./gradlew :desktopApp:snapshots                # headless-скриншоты всех ролей на 390 / 1280 / 1920 dp + кадры сплэша (нужен API)
./gradlew :shared:desktopTest                  # графы DI: сборка всех ролей, полнота сессионных вкладов
```

## Дальше

- эндпоинты нарядов и бригад на сервере → заменить локальные репозитории;
- live-очередь через `/api/stream` (SSE, stream-ticket) вместо опроса;
- хранилище refresh-cookie и последнего логина между запусками (DataStore / NSUserDefaults);
- очередь выгрузки, переживающая смерть процесса (WorkManager / BGTaskScheduler);
- Xcode-проект `iosApp` на macOS;
- baseline profile для Android.
