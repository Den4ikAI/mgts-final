package ru.poputno.core.designsystem.tokens

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Отступы: шаг 4. Алиасы по роли масштабируются адаптивно (см. PpAdaptive). */
@Immutable
data class PpSpacing(
    val x0_5: Dp = 2.dp, val x1: Dp = 4.dp, val x2: Dp = 8.dp, val x3: Dp = 12.dp, val x4: Dp = 16.dp,
    val x5: Dp = 20.dp, val x6: Dp = 24.dp, val x8: Dp = 32.dp, val x10: Dp = 40.dp, val x12: Dp = 48.dp,
    val x16: Dp = 64.dp, val x20: Dp = 80.dp, val x24: Dp = 96.dp,
    /** Ролевые алиасы, зависят от класса окна. */
    val element: Dp = 12.dp,
    val card: Dp = 20.dp,
    val page: Dp = 16.dp,
    val section: Dp = 48.dp,
)

/** Радиусы «приборные», сдержанные. Капсула (pill) у контролов камеры и статусов. */
@Immutable
data class PpRadii(
    val xs: Dp = 4.dp, val sm: Dp = 6.dp, val md: Dp = 8.dp, val lg: Dp = 12.dp, val xl: Dp = 16.dp,
    val xxl: Dp = 24.dp,
) {
    val tag = RoundedCornerShape(xs)
    val control = RoundedCornerShape(md)
    val compact = RoundedCornerShape(sm)
    val card = RoundedCornerShape(lg)
    val sheet = RoundedCornerShape(topStart = xxl, topEnd = xxl)
    val dialog = RoundedCornerShape(xl)
    val pill = RoundedCornerShape(percent = 50)
}

@Immutable
data class PpSizes(
    val controlSm: Dp = 32.dp, val controlMd: Dp = 40.dp, val controlLg: Dp = 48.dp,
    val targetMin: Dp = 44.dp,
    val iconSm: Dp = 16.dp, val iconMd: Dp = 20.dp, val iconLg: Dp = 24.dp, val iconXl: Dp = 48.dp,
    val hairline: Dp = 1.dp,
    val strokeRoute: Dp = 2.dp,
    val strokeDetect: Dp = 2.dp,
    val detectArm: Dp = 14.dp,
    val focusRing: Dp = 2.dp,
    val headerHeight: Dp = 56.dp,
    val railWidth: Dp = 80.dp,
    val sidebarWidth: Dp = 248.dp,
    val contentMax: Dp = 1280.dp,
    /** Камера: затвор и кнопки-капсулы вокруг него. */
    val shutter: Dp = 84.dp,
    val cameraControl: Dp = 52.dp,
)
