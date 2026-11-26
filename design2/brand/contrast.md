# Контраст токенов «Попутно»

Считается скриптом `brand/tools/contrast.py` прямо из `tokens.css` (WCAG 2.1, относительная яркость).
Полупрозрачные фоны сначала накладываются на подложку из столбца «Фон». Порог: текст 4.5:1, значимая графика (иконки статуса, фокус, линия маршрута) 3:1.

## Тёмная тема (основная) · Текст, ≥ 4.5:1

| Текст / элемент | Фон | Цвета | Контраст | Проходит |
|---|---|---|---|---|
| `--text-primary` | `--surface-base` | `#EEF2F6` / `#030E1C` | 17.23 | да |
| `--text-primary` | `--surface-raised` | `#EEF2F6` / `#061A2E` | 15.62 | да |
| `--text-primary` | `--surface-sunken` | `#EEF2F6` / `#020913` | 17.76 | да |
| `--text-primary` | `--surface-overlay` | `#EEF2F6` / `#0A2540` | 13.81 | да |
| `--text-secondary` | `--surface-base` | `#AEB9C6` / `#030E1C` | 9.74 | да |
| `--text-secondary` | `--surface-raised` | `#AEB9C6` / `#061A2E` | 8.83 | да |
| `--text-secondary` | `--surface-sunken` | `#AEB9C6` / `#020913` | 10.04 | да |
| `--text-secondary` | `--surface-overlay` | `#AEB9C6` / `#0A2540` | 7.81 | да |
| `--text-muted` | `--surface-base` | `#8A97A8` / `#030E1C` | 6.53 | да |
| `--text-muted` | `--surface-raised` | `#8A97A8` / `#061A2E` | 5.92 | да |
| `--text-muted` | `--surface-sunken` | `#8A97A8` / `#020913` | 6.73 | да |
| `--text-muted` | `--surface-overlay` | `#8A97A8` / `#0A2540` | 5.23 | да |
| `--text-accent` | `--surface-base` | `#6FB3F5` / `#030E1C` | 8.72 | да |
| `--text-accent` | `--surface-raised` | `#6FB3F5` / `#061A2E` | 7.90 | да |
| `--text-accent` | `--surface-sunken` | `#6FB3F5` / `#020913` | 8.98 | да |
| `--text-accent` | `--surface-overlay` | `#6FB3F5` / `#0A2540` | 6.99 | да |
| `--text-link` | `--surface-base` | `#6FB3F5` / `#030E1C` | 8.72 | да |
| `--text-link` | `--surface-raised` | `#6FB3F5` / `#061A2E` | 7.90 | да |
| `--text-link` | `--surface-sunken` | `#6FB3F5` / `#020913` | 8.98 | да |
| `--text-link` | `--surface-overlay` | `#6FB3F5` / `#0A2540` | 6.99 | да |
| `--text-link-hover` | `--surface-base` | `#A6D0FA` / `#030E1C` | 12.02 | да |
| `--text-inverse` | `--surface-inverse` | `#030E1C` / `#EEF2F6` | 17.23 | да |
| `--text-on-accent` | `--action-primary` | `#FFFFFF` / `#0068C2` | 5.59 | да |
| `--text-on-accent` | `--action-primary-hover` | `#FFFFFF` / `#0576D6` | 4.60 | да |
| `--text-on-accent` | `--action-primary-press` | `#FFFFFF` / `#00549E` | 7.60 | да |
| `--text-on-accent` | `--action-danger` | `#FFFFFF` / `#C42427` | 5.79 | да |
| `--text-on-accent` | `--action-danger-hover` | `#FFFFFF` / `#D42E31` | 4.96 | да |
| `--action-secondary-fg` | `--action-secondary` на --surface-base | `#EEF2F6` / `#141F2D` | 14.77 | да |
| `--accent-fg` | `--accent-subtle` на --surface-raised | `#A6D0FA` / `#072948` | 9.17 | да |
| `--text-primary` | `--surface-selected` на --surface-raised | `#EEF2F6` / `#072B4B` | 12.82 | да |
| `--text-on-scan` | `--scan` | `#030E1C` / `#2ADCF0` | 11.62 | да |
| `--detect-tag-fg` | `--detect-tag-bg` | `#030E1C` / `#2ADCF0` | 11.62 | да |
| `--sev-critical-fg` | `--sev-critical-bg` | `#FFFFFF` / `#C42427` | 5.79 | да |
| `--sev-fg` | `--surface-raised` | `#EEF2F6` / `#061A2E` | 15.62 | да |
| `--status-on-solid` | `--status-ok-solid` | `#030E1C` / `#1FA971` | 6.43 | да |
| `--status-on-solid` | `--status-suspected-solid` | `#030E1C` / `#E8B520` | 10.21 | да |
| `--status-on-solid` | `--status-defect-solid` | `#030E1C` / `#EC7A1C` | 6.80 | да |
| `--status-on-solid` | `--status-critical-solid` | `#030E1C` / `#E5383B` | 4.58 | да |
| `--prov-model-fg` | `--prov-model-bg` на --surface-raised | `#5FE5F4` / `#0A2D41` | 9.56 | да |
| `--prov-human-fg` | `--prov-human-bg` на --surface-raised | `#EEF2F6` / `#1A2D40` | 12.50 | да |
| `--chart-label` | `--surface-raised` | `#8A97A8` / `#061A2E` | 5.92 | да |
| `--map-label` | `--map-land` | `#8A97A8` / `#030E1C` | 6.53 | да |
| `--map-label` | `--map-block` | `#8A97A8` / `#061A2E` | 5.92 | да |
| `--status-ok-fg` | `--status-ok-bg` на --surface-raised | `#5CC895` / `#0A2E37` | 6.96 | да |
| `--status-ok-fg` | `--status-ok-bg` на --surface-base | `#5CC895` / `#072428` | 7.86 | да |
| `--status-suspected-fg` | `--status-suspected-bg` на --surface-raised | `#F0C94D` / `#232E2C` | 8.79 | да |
| `--status-suspected-fg` | `--status-suspected-bg` на --surface-base | `#F0C94D` / `#21241D` | 9.86 | да |
| `--status-defect-fg` | `--status-defect-bg` на --surface-raised | `#F39A52` / `#28282B` | 6.69 | да |
| `--status-defect-fg` | `--status-defect-bg` на --surface-base | `#F39A52` / `#261E1C` | 7.44 | да |
| `--status-critical-fg` | `--status-critical-bg` на --surface-raised | `#EE7275` / `#2A1F30` | 5.46 | да |
| `--status-critical-fg` | `--status-critical-bg` на --surface-base | `#EE7275` / `#271521` | 6.01 | да |
| `--status-not-observed-fg` | `--status-not-observed-bg` на --surface-raised | `#AEB9C6` / `#112438` | 7.92 | да |
| `--status-not-observed-fg` | `--status-not-observed-bg` на --surface-base | `#AEB9C6` / `#0E1927` | 8.89 | да |

## Тёмная тема (основная) · Графика, ≥ 3:1

| Текст / элемент | Фон | Цвета | Контраст | Проходит |
|---|---|---|---|---|
| `--status-ok` | `--surface-raised` | `#34B87F` / `#061A2E` | 6.95 | да |
| `--status-suspected` | `--surface-raised` | `#ECBD31` / `#061A2E` | 9.95 | да |
| `--status-defect` | `--surface-raised` | `#EF8834` / `#061A2E` | 6.90 | да |
| `--status-critical` | `--surface-raised` | `#EA5558` / `#061A2E` | 4.97 | да |
| `--status-not-observed` | `--surface-raised` | `#8A97A8` / `#061A2E` | 5.92 | да |
| `--focus-ring` | `--surface-base` | `#2ADCF0` / `#030E1C` | 11.62 | да |
| `--focus-ring` | `--surface-raised` | `#2ADCF0` / `#061A2E` | 10.54 | да |
| `--route-line` | `--surface-base` | `#0A84E6` / `#030E1C` | 5.04 | да |
| `--accent` | `--surface-base` | `#0A84E6` / `#030E1C` | 5.04 | да |
| `--sev-low` | `--surface-raised` | `#ECBD31` / `#061A2E` | 9.95 | да |
| `--sev-medium` | `--surface-raised` | `#EF8834` / `#061A2E` | 6.90 | да |
| `--sev-high` | `--surface-raised` | `#EA5558` / `#061A2E` | 4.97 | да |
| `--prov-model` | `--surface-raised` | `#2ADCF0` / `#061A2E` | 10.54 | да |
| `--chart-accent` | `--surface-raised` | `#3A98EE` / `#061A2E` | 5.78 | да |
| `--status-not-observed-border` | `--surface-raised` | `#6B7889` / `#061A2E` | 3.91 | да |
| `--route-line` | `--map-land` | `#0A84E6` / `#030E1C` | 5.04 | да |
| `--route-line` | `--map-block` | `#0A84E6` / `#061A2E` | 4.57 | да |
| `--map-pin-ring-suspected` | `--status-suspected-solid` | `#030E1C` / `#E8B520` | 10.21 | да |

## Светлая тема · Текст, ≥ 4.5:1

| Текст / элемент | Фон | Цвета | Контраст | Проходит |
|---|---|---|---|---|
| `--text-primary` | `--surface-base` | `#061A2E` / `#F5F8FB` | 16.49 | да |
| `--text-primary` | `--surface-raised` | `#061A2E` / `#FFFFFF` | 17.57 | да |
| `--text-primary` | `--surface-sunken` | `#061A2E` / `#EEF2F6` | 15.62 | да |
| `--text-primary` | `--surface-overlay` | `#061A2E` / `#FFFFFF` | 17.57 | да |
| `--text-secondary` | `--surface-base` | `#3E4A5A` / `#F5F8FB` | 8.45 | да |
| `--text-secondary` | `--surface-raised` | `#3E4A5A` / `#FFFFFF` | 9.01 | да |
| `--text-secondary` | `--surface-sunken` | `#3E4A5A` / `#EEF2F6` | 8.00 | да |
| `--text-secondary` | `--surface-overlay` | `#3E4A5A` / `#FFFFFF` | 9.01 | да |
| `--text-muted` | `--surface-base` | `#536072` / `#F5F8FB` | 6.00 | да |
| `--text-muted` | `--surface-raised` | `#536072` / `#FFFFFF` | 6.39 | да |
| `--text-muted` | `--surface-sunken` | `#536072` / `#EEF2F6` | 5.68 | да |
| `--text-muted` | `--surface-overlay` | `#536072` / `#FFFFFF` | 6.39 | да |
| `--text-accent` | `--surface-base` | `#0068C2` / `#F5F8FB` | 5.24 | да |
| `--text-accent` | `--surface-raised` | `#0068C2` / `#FFFFFF` | 5.59 | да |
| `--text-accent` | `--surface-sunken` | `#0068C2` / `#EEF2F6` | 4.97 | да |
| `--text-accent` | `--surface-overlay` | `#0068C2` / `#FFFFFF` | 5.59 | да |
| `--text-link` | `--surface-base` | `#0068C2` / `#F5F8FB` | 5.24 | да |
| `--text-link` | `--surface-raised` | `#0068C2` / `#FFFFFF` | 5.59 | да |
| `--text-link` | `--surface-sunken` | `#0068C2` / `#EEF2F6` | 4.97 | да |
| `--text-link` | `--surface-overlay` | `#0068C2` / `#FFFFFF` | 5.59 | да |
| `--text-link-hover` | `--surface-base` | `#03437E` / `#F5F8FB` | 9.35 | да |
| `--text-inverse` | `--surface-inverse` | `#F5F8FB` / `#061A2E` | 16.49 | да |
| `--text-on-accent` | `--action-primary` | `#FFFFFF` / `#0068C2` | 5.59 | да |
| `--text-on-accent` | `--action-primary-hover` | `#FFFFFF` / `#00549E` | 7.60 | да |
| `--text-on-accent` | `--action-primary-press` | `#FFFFFF` / `#03437E` | 9.96 | да |
| `--text-on-accent` | `--action-danger` | `#FFFFFF` / `#C42427` | 5.79 | да |
| `--text-on-accent` | `--action-danger-hover` | `#FFFFFF` / `#9E1D20` | 7.92 | да |
| `--action-secondary-fg` | `--action-secondary` на --surface-base | `#061A2E` / `#FFFFFF` | 17.57 | да |
| `--accent-fg` | `--accent-subtle` на --surface-raised | `#00549E` / `#EAF4FE` | 6.83 | да |
| `--text-primary` | `--surface-selected` на --surface-raised | `#061A2E` / `#EAF4FE` | 15.79 | да |
| `--text-on-scan` | `--scan` | `#FFFFFF` / `#0A7B8E` | 4.96 | да |
| `--detect-tag-fg` | `--detect-tag-bg` | `#030E1C` / `#2ADCF0` | 11.62 | да |
| `--sev-critical-fg` | `--sev-critical-bg` | `#FFFFFF` / `#C42427` | 5.79 | да |
| `--sev-fg` | `--surface-raised` | `#061A2E` / `#FFFFFF` | 17.57 | да |
| `--status-on-solid` | `--status-ok-solid` | `#030E1C` / `#1FA971` | 6.43 | да |
| `--status-on-solid` | `--status-suspected-solid` | `#030E1C` / `#E8B520` | 10.21 | да |
| `--status-on-solid` | `--status-defect-solid` | `#030E1C` / `#EC7A1C` | 6.80 | да |
| `--status-on-solid` | `--status-critical-solid` | `#030E1C` / `#E5383B` | 4.58 | да |
| `--prov-model-fg` | `--prov-model-bg` на --surface-raised | `#0E6270` / `#E8FCFE` | 6.60 | да |
| `--prov-human-fg` | `--prov-human-bg` на --surface-raised | `#061A2E` / `#EEF2F6` | 15.62 | да |
| `--chart-label` | `--surface-raised` | `#536072` / `#FFFFFF` | 6.39 | да |
| `--map-label` | `--map-land` | `#536072` / `#EEF2F6` | 5.68 | да |
| `--map-label` | `--map-block` | `#536072` / `#E2E8EF` | 5.18 | да |
| `--status-ok-fg` | `--status-ok-bg` на --surface-raised | `#126C49` / `#E8F7F0` | 5.81 | да |
| `--status-ok-fg` | `--status-ok-bg` на --surface-base | `#126C49` / `#E8F7F0` | 5.81 | да |
| `--status-suspected-fg` | `--status-suspected-bg` на --surface-raised | `#876608` / `#FDF8E6` | 5.02 | да |
| `--status-suspected-fg` | `--status-suspected-bg` на --surface-base | `#876608` / `#FDF8E6` | 5.02 | да |
| `--status-defect-fg` | `--status-defect-bg` на --surface-raised | `#9A4A0C` / `#FEF1E6` | 5.64 | да |
| `--status-defect-fg` | `--status-defect-bg` на --surface-base | `#9A4A0C` / `#FEF1E6` | 5.64 | да |
| `--status-critical-fg` | `--status-critical-bg` на --surface-raised | `#9E1D20` / `#FDECEC` | 6.94 | да |
| `--status-critical-fg` | `--status-critical-bg` на --surface-base | `#9E1D20` / `#FDECEC` | 6.94 | да |
| `--status-not-observed-fg` | `--status-not-observed-bg` на --surface-raised | `#536072` / `#F5F8FB` | 6.00 | да |
| `--status-not-observed-fg` | `--status-not-observed-bg` на --surface-base | `#536072` / `#F5F8FB` | 6.00 | да |

## Светлая тема · Графика, ≥ 3:1

| Текст / элемент | Фон | Цвета | Контраст | Проходит |
|---|---|---|---|---|
| `--status-ok` | `--surface-raised` | `#16885A` / `#FFFFFF` | 4.46 | да |
| `--status-suspected` | `--surface-raised` | `#B88C0F` / `#FFFFFF` | 3.09 | да |
| `--status-defect` | `--surface-raised` | `#C45F0E` / `#FFFFFF` | 4.21 | да |
| `--status-critical` | `--surface-raised` | `#C42427` / `#FFFFFF` | 5.79 | да |
| `--status-not-observed` | `--surface-raised` | `#6B7889` / `#FFFFFF` | 4.49 | да |
| `--focus-ring` | `--surface-base` | `#0068C2` / `#F5F8FB` | 5.24 | да |
| `--focus-ring` | `--surface-raised` | `#0068C2` / `#FFFFFF` | 5.59 | да |
| `--route-line` | `--surface-base` | `#0068C2` / `#F5F8FB` | 5.24 | да |
| `--accent` | `--surface-base` | `#0068C2` / `#F5F8FB` | 5.24 | да |
| `--sev-low` | `--surface-raised` | `#B88C0F` / `#FFFFFF` | 3.09 | да |
| `--sev-medium` | `--surface-raised` | `#C45F0E` / `#FFFFFF` | 4.21 | да |
| `--sev-high` | `--surface-raised` | `#E5383B` / `#FFFFFF` | 4.23 | да |
| `--prov-model` | `--surface-raised` | `#009EBF` / `#FFFFFF` | 3.16 | да |
| `--chart-accent` | `--surface-raised` | `#0068C2` / `#FFFFFF` | 5.59 | да |
| `--status-not-observed-border` | `--surface-raised` | `#6B7889` / `#FFFFFF` | 4.49 | да |
| `--route-line` | `--map-land` | `#0068C2` / `#EEF2F6` | 4.97 | да |
| `--route-line` | `--map-block` | `#0068C2` / `#E2E8EF` | 4.53 | да |
| `--map-pin-ring-suspected` | `--status-suspected-solid` | `#061A2E` / `#E8B520` | 9.26 | да |

Итог: все пары проходят.

Не проверяются как текст: `--text-disabled` (неактивное, WCAG не требует), `--border-*` (декоративные линии; значимые контуры идут через `--border-strong` и статусные цвета), `--scan` на светлом (циан на светлом не используется для текста по правилу бренда), `--status-*-solid` к подложке карты (метку читают по форме и знаку внутри, пара знак/заливка проверена выше через `--status-on-solid`).
