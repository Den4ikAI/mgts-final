# Попутно · основа бренда

Здесь лежат токены, компоненты, знак и иконки. Брендбук (`brand/index.html`), дека (`deck/`) и сайт (`site/`) берут цвета, шрифты, радиусы и движение только отсюда.

Посмотреть всё сразу: `foundation-preview.html` (переключатель темы в шапке, `?theme=dark|light` в адресе).
Скриншоты: `notes/shots/foundation-{dark|light}-*.png`, `foundation-mobile-390.png`, `foundation-logo-qa.png`, `foundation-mark-anim-frames.png`.

## Подключение

```html
<link rel="stylesheet" href="../brand/fonts/fonts.css">
<link rel="stylesheet" href="../brand/tokens.css">
<link rel="stylesheet" href="../brand/components.css">  <!-- если нужны компоненты -->
<body class="pp-page">
```

Тема: по умолчанию тёмная, светлая включается системной настройкой. Явно: `<html data-theme="dark">` или `<html data-theme="light">`. Атрибут можно поставить и на вложенный блок: семантические токены переназначаются в нём.

Иконки: `<svg class="pp-icon"><use href="../brand/icons.svg#i-search"/></svg>`. По http это работает напрямую. По `file://` браузер не подключает внешний спрайт: вставьте его содержимое в страницу (так сделано в `foundation-preview.html`, скрипт `tools/build_preview.py`) или берите отдельные файлы из `icons/`.

## Файлы

| Файл | Что это |
|---|---|
| `tokens.css` | Единственный источник токенов: палитра, семантика тёмной и светлой темы, типографика, отступы, радиусы, слои, движение, «меньше движения» |
| `components.css` | Базовые компоненты `pp-*`, только `var(--…)` |
| `contrast.md` | Контраст всех текстовых и графических пар в обеих темах (генерируется `tools/contrast.py`) |
| `icons.svg`, `icons/*.svg` | 31 иконка: сетка 24, штрих 1.75, круглые концы, `currentColor` |
| `logo/mark.svg`, `mark-light.svg` | Знак для тёмного и светлого фона |
| `logo/mark-mono-white.svg`, `mark-mono-navy.svg` | Знак одной краской |
| `logo/logo-dark.svg`, `logo-light.svg` | Знак + слово «попутно» (кривые Unbounded 600, трекинг −2 %) |
| `logo/logo-mono-white.svg`, `logo-mono-navy.svg`, `logo-on-signal.svg` | Одноцветные и для синего фона (сам файл прозрачный, фон `--p-signal-500` ставит носитель) |
| `logo/wordmark-dark.svg`, `wordmark-light.svg` | Только слово |
| `logo/favicon.svg` | Фавикон, сетка 32, плитка navy, без линии маршрута |
| `logo/og-cover.svg`, `og-cover.png` | Превью для ссылок 1200 × 630, весь текст в кривых |
| `logo/mark-anim.html` | Сниппет анимации знака и загрузчика |
| `logo/build_logo.py` | Сборка всех SVG из геометрии знака и шрифтов (`fonttools`, `brotli`) |
| `tools/build_icons.py`, `tools/build_preview.py`, `tools/contrast.py` | Иконки, вклейка спрайта и логотипа в превью, проверка контраста |

Пересборка: `python3 logo/build_logo.py && python3 tools/build_icons.py && python3 tools/build_preview.py && python3 tools/contrast.py > contrast.md`

## Имена токенов

Два слоя. Компоненты, дека и сайт используют только второй.

1. Палитра `--p-{оттенок}-{шаг}`: `navy` 50…1000, `signal` 50…950 (+550), `scan` 50…950, `slate` 0…950, статусы `ok`, `suspected`, `defect`, `critical` (+550), `unseen` (= slate, для «Не наблюдается»).
2. Семантика (меняется с темой):

| Группа | Токены |
|---|---|
| Поверхности | `--surface-sunken` `--surface-base` (фон страницы) `--surface-raised` (карточка) `--surface-raised-hover` `--surface-overlay` (меню, тост) `--surface-inverse` `--surface-selected` `--surface-skeleton` `--surface-scrim` |
| Текст | `--text-primary` `--text-secondary` `--text-muted` `--text-disabled` `--text-inverse` `--text-accent` `--text-link` `--text-link-hover` `--text-on-accent` `--text-on-scan` `--text-danger` (только ошибка ввода) |
| Линии | `--border-subtle` `--border-default` `--border-strong` `--border-accent` |
| Акцент | `--accent` `--accent-strong` `--accent-subtle` `--accent-subtle-hover` `--accent-fg` `--scan` `--scan-subtle` |
| Действия | `--action-primary(-hover/-press)` `--action-secondary(-hover/-press/-fg)` `--action-ghost-hover/-press` `--action-danger(-hover/-press)` `--action-disabled` |
| Фокус | `--focus-ring` (циан на тёмном, синий на светлом) `--focus-ring-width` `--focus-ring-offset` |
| Статус объекта | `--status-{ok|suspected|defect|critical|not-observed}` (иконка), `-fg` (текст), `-bg`, `-border`, `-solid` (метка на карте, одинакова в темах), `--status-on-solid` |
| Опасность | `--sev-low` `--sev-medium` `--sev-high` `--sev-critical` `--sev-track` `--sev-critical-bg/-fg` |
| Детекция | `--detect-frame` `--detect-defect` `--detect-tag-bg/-fg` `--detect-frame-shadow` `--detect-arm` `--stroke-detect` |
| Происхождение | `--prov-model(-fg/-bg)` «найдено моделью», `--prov-human(-fg/-bg)` «подтверждено человеком» |
| Маршрут | `--route-line` `--route-track` `--route-node` `--stroke-route` |
| Графики | `--chart-series` `--chart-series-2` `--chart-accent` `--chart-grid` `--chart-axis` `--chart-label` |
| Логотип inline | `--logo-mark` `--logo-dot` `--logo-word` |
| Поверх фото | `--on-media` `--on-media-muted` |
| Тени | `--shadow-ring` `--shadow-raised` `--shadow-float` `--shadow-overlay` |

Независимые от темы: `--font-display|sans|mono`, `--weight-*`, `--text-{display|h1|h2|h3|title|body|body-sm|label|caption|micro|kpi}-{size|lh|tr}`, `--space-0…24` (шаг 4) и алиасы `--space-card|page|section`, `--radius-xs|sm|md|lg|xl|pill` (4/6/8/12/16/999), `--control-sm|md|lg` (32/40/48), `--target-min` 44, `--icon-*`, `--z-*`, `--bp-*`, `--ease-out|in-out|drawer|route|linear`, `--dur-*`, `--stagger`, `--press-scale` 0.97, `--enter-scale`, `--snap-scale` 1.15, `--shift-*`, `--delay-*`, `--toast-life*`, `--transition-control`.

## Классы

| Компонент | Классы |
|---|---|
| Основа | `.pp-page` (на body) |
| Текст | `.pp-display` `.pp-h1` `.pp-h2` (Unbounded) `.pp-h3` `.pp-title` `.pp-body` `.pp-body-sm` `.pp-label` `.pp-caption` `.pp-micro` `.pp-mono` `.pp-num` `.pp-muted` `.pp-secondary` `.pp-id` `.pp-link` `.pp-kbd` |
| Иконка | `.pp-icon` `--sm` `--lg` `--xl` |
| Кнопка | `.pp-btn` + `--primary` `--secondary` `--ghost` `--danger`, `--sm` `--lg` `--icon` `--block`; `:disabled`, `aria-busy="true"` |
| Статус | `.pp-status` + `--ok` `--suspected` `--defect` `--critical` `--not-observed` (пунктир), `--sm`, `--pulse` (один раз); части `__icon`; точка `.pp-dot--{статус}` |
| Опасность | `.pp-sev` + `--low|medium|high|critical`, `data-level="1..4"`, `__bars` с 4 `<i>` |
| Уголки | `.pp-corners` (`--corners-color|arm|stroke|inset`) |
| Рамка детекции | `.pp-detect` > `img` + `.pp-detect__box` (`--x --y --w --h` в %) + `__tag` (уверенность в `<b>`), `__box--defect|critical|muted|below|enter`, `__caption` |
| Происхождение | `.pp-prov--model` (циан в уголках) `.pp-prov--human` (сплошная, иконка `user-check`), `__conf` |
| Карточка | `.pp-card` `__head` `__title` `__meta` `__body` `__foot` `__media`, `--flat` `--interactive` `--selected` |
| KPI | `.pp-kpi` `__label` `__value` `__unit` `__delta` (`--up|down|good`), `--accent` |
| Поля | `.pp-field` `__label` `__hint`, `data-invalid="true"`; `.pp-input` (`--mono`, `aria-invalid`), `.pp-select` + `__chevron`, `.pp-search` + `__icon` + `.pp-kbd` |
| Сегменты | `.pp-segmented` > `.pp-segmented__item[aria-pressed]` |
| Вкладки | `.pp-tabs` > `.pp-tab[aria-selected]` + `__count` |
| Таблица | `.pp-table-wrap` > `.pp-table` (`--dense`), `.pp-table__num`, `.pp-table__main`, `tr[aria-selected]` |
| Тост | `.pp-toast` `--ok` `--critical`, `__icon` `__title` `__text` |
| Подсказка | `.pp-tooltip` |
| Скелетон | `.pp-skeleton` `--text` `--title` `--block` |
| Пусто | `.pp-empty` `__icon` (+ `.pp-corners`) `__title` `__text` `__actions` |
| Маршрут | `.pp-route` (`--accent`, `--draw`) + `__node` (`--{статус}`, `--filled`, `--at`); `.pp-progress` > `__fill` (`--value` 0…1); `.pp-timeline` > `__item(--done)` > `__node(--{статус})` `__time` `__text` `__meta` |
| Бейдж | `.pp-badge` `--accent` |
| Логотип inline | `.pp-logo` (цвета из темы) |
| Знак в движении | `.pp-mark` + `.pp-mark-anim` (однократно, 900 мс) или `.pp-mark-anim--loop` (загрузчик); части `.pp-mark__route-l|r`, `__frame`, `__c`, `__dot` уже размечены в `logo/mark.svg` |

## Правила

1. **Нет HEX вне `tokens.css`.** В CSS и разметке деки, сайта и брендбука только `var(--…)`. `grep -nE '#[0-9a-fA-F]{3,8}\b'` по их CSS должен быть пустым (кроме data-URI). SVG-файлы логотипа несут свои цвета как атрибуты, это допустимо; при вставке inline класс `.pp-logo` перекрашивает их токенами.
2. **Тёплые цвета только для состояния объекта** (ok, suspected, defect, critical и шкала опасности). Бренд, графики, акценты, прогресс холодные. Исключение одно: ошибка ввода `--text-danger`.
3. **Статус не только цветом**: у каждого есть иконка и слово, «Не наблюдается» обведён пунктиром. Опасность читается по числу столбиков.
4. **Unbounded только от 20 px** (`.pp-display`, `.pp-h1`, `.pp-h2`, KPI, логотип). Интерфейс на Golos Text, данные на JetBrains Mono, цифры табличные.
5. **Циан редкий**: точка знака, рамка детекции, фокус на тёмном, «найдено моделью». Не для текста на светлом и не для заливки больших площадей.
6. **Одна основная кнопка на экран.** Графики: серый плюс один акцент signal.
7. **Движение**: ответ на клик до 300 мс, выход короче входа, только transform и opacity, без ease-in и пружин, hover под `(hover: hover) and (pointer: fine)`. «Меньше движения» обнуляет сдвиги и масштаб на уровне токенов.
8. **Знак**: не перекрашивать отдельные элементы, не растягивать, не поворачивать, без теней и обводок. Полный знак от 24 px, логотип от 96 px по ширине, меньше только `favicon.svg`. Охранное поле = плечо уголка (17/64 высоты знака).
9. Числа, которых ещё нет (объекты МГТС, точность на датасете организаторов), показываем плейсхолдером `[ДАННЫЕ]`.
