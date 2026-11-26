package ru.poputno.core.designsystem.tokens

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Класс окна по ширине. Брейкпоинты те же, что в tokens.css (480/768/1024/1440), переведены в dp.
 * Раскладка выбирается по классу, а не по платформе: телефон, планшет, окно desktop
 * и растянутое окно ведут себя одинаково при одинаковой ширине.
 */
enum class PpWidthClass(val minWidth: Dp) {
    /** Телефон в портрете. Плавающий док снизу, одна колонка. */
    Compact(0.dp),
    /** Большой телефон, планшет в портрете. Rail слева, две колонки. */
    Medium(600.dp),
    /** Планшет в ландшафте, окно desktop. Сайдбар, список + деталь. */
    Expanded(1024.dp),
    /** Широкий монитор, проектор. UI укрупняется. */
    Large(1440.dp);

    companion object {
        fun of(width: Dp): PpWidthClass = entries.last { width >= it.minWidth }
    }
}

/**
 * Адаптивные метрики. Намеренно ДИСКРЕТНЫЕ: ширина квантуется ступенями [FLUID_STEP_DP],
 * поэтому протягивание окна на пиксель не меняет значение и не перекомпонует приложение.
 * Перекомпоновка происходит только на смене ступени (раз в 48 dp) или класса.
 *
 *  - [widthClass] — раскладка;
 *  - [fluid] — кегли display/h1/kpi между 360 и 1440 dp (аналог clamp());
 *  - [spacing] — ролевые отступы по классу; [columns] — сетка карточек.
 */
@Immutable
data class PpAdaptive(
    val widthClass: PpWidthClass,
    val fluid: PpFluidType,
    val columns: Int,
    val spacing: PpSpacing,
) {
    val isCompact get() = widthClass == PpWidthClass.Compact
    val atLeastMedium get() = widthClass >= PpWidthClass.Medium
    val atLeastExpanded get() = widthClass >= PpWidthClass.Expanded

    companion object {
        private const val MIN_W = 360f
        private const val MAX_W = 1440f
        private const val SCALE_STEP = 0.05f
        private const val SCALE_MAX = 1.25f
        const val FLUID_STEP_DP = 48

        /**
         * Укрупнение UI для окон шире 1440 dp, ступенями по 5 %: на большом мониторе экран
         * не «расползается» мелким, а промежуточный ресайз не дёргает density.
         */
        fun scaleFor(rawWidth: Dp): Float {
            val raw = (rawWidth.value / MAX_W).coerceIn(1f, SCALE_MAX)
            return (kotlin.math.floor(raw / SCALE_STEP) * SCALE_STEP).coerceAtLeast(1f)
        }

        /** Ступень ширины: ключ для remember, меняется дискретно. */
        fun bucketOf(width: Dp): Int = (width.value / FLUID_STEP_DP).toInt()

        fun from(bucket: Int): PpAdaptive {
            val width = (bucket * FLUID_STEP_DP).dp
            val wc = PpWidthClass.of(width)
            val t = ((width.value - MIN_W) / (MAX_W - MIN_W)).coerceIn(0f, 1f)
            fun lerp(a: Float, b: Float) = (a + (b - a) * t).toInt().toFloat()
            val fluid = PpFluidType(display = lerp(30f, 72f).sp, h1 = lerp(26f, 48f).sp, kpi = lerp(36f, 56f).sp)
            return PpAdaptive(wc, fluid, COLUMNS.getValue(wc), SPACING.getValue(wc))
        }

        private val COLUMNS = mapOf(
            PpWidthClass.Compact to 1, PpWidthClass.Medium to 2, PpWidthClass.Expanded to 3, PpWidthClass.Large to 4,
        )
        private val SPACING = mapOf(
            PpWidthClass.Compact to PpSpacing(page = 16.dp, card = 16.dp, section = 32.dp, element = 12.dp),
            PpWidthClass.Medium to PpSpacing(page = 24.dp, card = 20.dp, section = 40.dp, element = 12.dp),
            PpWidthClass.Expanded to PpSpacing(page = 32.dp, card = 20.dp, section = 48.dp, element = 16.dp),
            PpWidthClass.Large to PpSpacing(page = 40.dp, card = 24.dp, section = 64.dp, element = 16.dp),
        )
    }
}
