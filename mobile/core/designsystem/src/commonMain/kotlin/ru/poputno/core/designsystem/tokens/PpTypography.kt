package ru.poputno.core.designsystem.tokens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.Font
import ru.poputno.core.designsystem.res.Res
import ru.poputno.core.designsystem.res.golos_400
import ru.poputno.core.designsystem.res.golos_500
import ru.poputno.core.designsystem.res.golos_600
import ru.poputno.core.designsystem.res.golos_700
import ru.poputno.core.designsystem.res.jetbrains_mono_400
import ru.poputno.core.designsystem.res.jetbrains_mono_500
import ru.poputno.core.designsystem.res.jetbrains_mono_600
import ru.poputno.core.designsystem.res.unbounded_500
import ru.poputno.core.designsystem.res.unbounded_600
import ru.poputno.core.designsystem.res.unbounded_700

@Immutable
data class PpFonts(val display: FontFamily, val sans: FontFamily, val mono: FontFamily)

/** Семейства шрифтов. Font(Res.font.…) сам кэшируется ресурсами Compose; здесь только сборка. */
@Composable
fun ppFonts(): PpFonts = PpFonts(
    display = FontFamily(
        Font(Res.font.unbounded_500, FontWeight.Medium),
        Font(Res.font.unbounded_600, FontWeight.SemiBold),
        Font(Res.font.unbounded_700, FontWeight.Bold),
    ),
    sans = FontFamily(
        Font(Res.font.golos_400, FontWeight.Normal),
        Font(Res.font.golos_500, FontWeight.Medium),
        Font(Res.font.golos_600, FontWeight.SemiBold),
        Font(Res.font.golos_700, FontWeight.Bold),
    ),
    mono = FontFamily(
        Font(Res.font.jetbrains_mono_400, FontWeight.Normal),
        Font(Res.font.jetbrains_mono_500, FontWeight.Medium),
        Font(Res.font.jetbrains_mono_600, FontWeight.SemiBold),
    ),
)

/**
 * Шкала текста. Unbounded только от 20 sp (display, h1, h2, kpi), интерфейс на Golos Text,
 * данные (ID, координаты, уверенность, время) на JetBrains Mono, цифры табличные.
 * display/h1/kpi «жидкие»: размер задаёт [PpAdaptive] по ширине окна, как clamp() в CSS.
 */
@Immutable
data class PpTypography(
    val display: TextStyle, val h1: TextStyle, val h2: TextStyle, val h3: TextStyle,
    val title: TextStyle, val body: TextStyle, val bodySm: TextStyle, val label: TextStyle,
    val caption: TextStyle, val micro: TextStyle, val kpi: TextStyle,
    val mono: TextStyle, val monoSm: TextStyle,
) {
    companion object {
        private const val TNUM = "tnum"

        fun build(fonts: PpFonts, fluid: PpFluidType): PpTypography {
            fun disp(size: TextUnit, lh: Float, tr: Float) = TextStyle(
                fontFamily = fonts.display, fontWeight = FontWeight.SemiBold, fontSize = size,
                lineHeight = size * lh, letterSpacing = tr.em, fontFeatureSettings = TNUM,
            )
            fun sans(size: Float, lh: Float, w: FontWeight, tr: Float = 0f) = TextStyle(
                fontFamily = fonts.sans, fontWeight = w, fontSize = size.sp, lineHeight = (size * lh).sp,
                letterSpacing = tr.em, fontFeatureSettings = TNUM,
            )
            return PpTypography(
                display = disp(fluid.display, 1.08f, -0.035f),
                h1 = disp(fluid.h1, 1.15f, -0.025f),
                h2 = disp(28.sp, 1.25f, -0.02f),
                h3 = sans(20f, 1.3f, FontWeight.SemiBold, -0.01f),
                title = sans(18f, 1.35f, FontWeight.SemiBold, -0.005f),
                body = sans(16f, 1.55f, FontWeight.Normal),
                bodySm = sans(14f, 1.45f, FontWeight.Normal),
                label = sans(13f, 1.3f, FontWeight.SemiBold),
                caption = sans(12f, 1.4f, FontWeight.Normal),
                micro = sans(11f, 1.3f, FontWeight.SemiBold, 0.04f),
                kpi = disp(fluid.kpi, 1f, -0.03f),
                mono = TextStyle(fontFamily = fonts.mono, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = (-0.01).em, fontFeatureSettings = TNUM),
                monoSm = TextStyle(fontFamily = fonts.mono, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = (-0.01).em, fontFeatureSettings = TNUM),
            )
        }
    }
}

@Immutable
data class PpFluidType(val display: TextUnit, val h1: TextUnit, val kpi: TextUnit)
