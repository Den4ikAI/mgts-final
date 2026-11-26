package ru.poputno.core.designsystem

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import ru.poputno.core.designsystem.foundation.PpIndication
import ru.poputno.core.designsystem.foundation.LocalContentColor
import ru.poputno.core.designsystem.foundation.LocalTextStyle
import ru.poputno.core.designsystem.tokens.PpAdaptive
import ru.poputno.core.designsystem.tokens.PpColors
import ru.poputno.core.designsystem.tokens.PpMotion
import ru.poputno.core.designsystem.tokens.PpRadii
import ru.poputno.core.designsystem.tokens.PpSizes
import ru.poputno.core.designsystem.tokens.PpSpacing
import ru.poputno.core.designsystem.tokens.PpTypography
import ru.poputno.core.designsystem.tokens.ppFonts

val LocalPpColors = staticCompositionLocalOf { PpColors.Dark }
val LocalPpTypography = staticCompositionLocalOf<PpTypography> { error("PpTheme не подключена") }
val LocalPpAdaptive = staticCompositionLocalOf<PpAdaptive> { error("PpTheme не подключена") }
val LocalPpRadii = staticCompositionLocalOf { PpRadii() }
val LocalPpSizes = staticCompositionLocalOf { PpSizes() }
val LocalPpMotion = staticCompositionLocalOf { PpMotion.Default }

/** Точка доступа к токенам: `Pp.colors.surface.base`, `Pp.type.title`, `Pp.space.page`. */
object Pp {
    val colors: PpColors @Composable @ReadOnlyComposable get() = LocalPpColors.current
    val type: PpTypography @Composable @ReadOnlyComposable get() = LocalPpTypography.current
    val adaptive: PpAdaptive @Composable @ReadOnlyComposable get() = LocalPpAdaptive.current
    val space: PpSpacing @Composable @ReadOnlyComposable get() = LocalPpAdaptive.current.spacing
    val radii: PpRadii @Composable @ReadOnlyComposable get() = LocalPpRadii.current
    val sizes: PpSizes @Composable @ReadOnlyComposable get() = LocalPpSizes.current
    val motion: PpMotion @Composable @ReadOnlyComposable get() = LocalPpMotion.current
}

enum class PpThemeMode { Dark, Light }

/**
 * Корень дизайн-системы. Меряет окно, вычисляет адаптивные метрики, при необходимости
 * укрупняет density (широкие окна), и раздаёт токены через CompositionLocal.
 * Material не используется: индикация, цвет контента и стиль текста свои.
 */
@Composable
fun PpTheme(
    mode: PpThemeMode = PpThemeMode.Dark,
    reducedMotion: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = if (mode == PpThemeMode.Dark) PpColors.Dark else PpColors.Light
    val fonts = ppFonts()
    BoxWithConstraints(Modifier.fillMaxSize().background(colors.surface.base)) {
        val baseDensity = LocalDensity.current
        // все производные — от дискретных ключей: ресайз окна на пиксель не перекомпонует дерево
        val scale = PpAdaptive.scaleFor(maxWidth)
        val bucket = PpAdaptive.bucketOf(maxWidth / scale)
        val density = remember(baseDensity, scale) { Density(baseDensity.density * scale, baseDensity.fontScale) }
        val adaptive = remember(bucket) { PpAdaptive.from(bucket) }
        val typography = remember(fonts, adaptive.fluid) { PpTypography.build(fonts, adaptive.fluid) }
        val motion = if (reducedMotion) PpMotion.Reduced else PpMotion.Default
        CompositionLocalProvider(
            LocalDensity provides density,
            LocalPpColors provides colors,
            LocalPpTypography provides typography,
            LocalPpAdaptive provides adaptive,
            LocalPpMotion provides motion,
            LocalIndication provides PpIndication,
            LocalContentColor provides colors.text.primary,
            LocalTextStyle provides typography.bodySm,
            LocalTextSelectionColors provides TextSelectionColors(colors.accent.scan, colors.accent.scan.copy(alpha = 0.28f)),
            content = content,
        )
    }
}

/**
 * Принудительная тёмная палитра для части дерева (камера: кадр — главное).
 * Только цвета: адаптив, шрифты и density не пересчитываются, в отличие от вложенной PpTheme.
 */
@Composable
fun PpDarkSurface(content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalPpColors provides PpColors.Dark,
        LocalContentColor provides PpColors.Dark.text.primary,
        content = content,
    )
}
