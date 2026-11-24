# Дизайн

Дизайн-система **МГТС Инфраструктура** ведётся в Claude Design:
https://claude.ai/artifact/TaPqcc8YbEn4TK27j9dXPi (приватная, доступ команде даёт владелец через Share).

Что в ней: токены (две темы: тёмная для диспетчерской, светлая для поля), шрифты Unbounded / Golos Text / JetBrains Mono,
CSS-компоненты `StatusPill`, `Button`, `EvidenceCard`, `QueueRow`, `MapPin`, `KpiTile`.

Копия исходников лежит в `design/`. Фронт использует:

- `web/src/styles/tokens.css`, сгенерирован из `design/tokens.json`;
- `web/src/styles/mgts.css`, копия `design/components/bundle.css` (классы `mg-*`).

Если поменяли систему в Claude Design, обновите `design/` и перегенерируйте `tokens.css`.
Тема переключается атрибутом `data-theme="light"` на `<html>`, по умолчанию тёмная.

## Макеты экранов

Холст **МГТС Экраны**: https://claude.ai/artifact/KBnaBsUCsudh25qWk8PBsL (приватный, доступ через Share).

- Диспетчер: очередь разбора (кликабельная), карта статусов
- Карточка объекта: проезды за 30 дней, история событий из `object.events`, паспорт, наряды
- Руководитель: сводка (покрытие осмотра, районы, что ломается, где ошибается модель)
- Бригада (телефон, светлая тема): наряд, закрытие с фото «после»
