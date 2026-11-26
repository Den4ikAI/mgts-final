package ru.poputno.core.designsystem.tokens

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.runtime.Immutable

/**
 * Движение: ответ на клик до 300 мс, выход короче входа, без пружин и ease-in.
 * [reduced] обнуляет сдвиги и масштаб на уровне токенов (как prefers-reduced-motion).
 */
@Immutable
data class PpMotion(
    /** «Меньше движения»: переходы без сдвигов и масштаба, только прозрачность. */
    val reduced: Boolean = false,
    val easeOut: Easing = CubicBezierEasing(0.23f, 1f, 0.32f, 1f),
    val easeInOut: Easing = CubicBezierEasing(0.77f, 0f, 0.175f, 1f),
    val easeDrawer: Easing = CubicBezierEasing(0.32f, 0.72f, 0f, 1f),
    val easeRoute: Easing = CubicBezierEasing(0.65f, 0f, 0.35f, 1f),
    val linear: Easing = LinearEasing,
    val instant: Int = 80, val press: Int = 140, val release: Int = 110, val fast: Int = 160,
    val fastExit: Int = 110, val base: Int = 200, val exit: Int = 140, val panel: Int = 260,
    val panelExit: Int = 200, val slow: Int = 320, val grow: Int = 480, val mark: Int = 900,
    val draw: Int = 900, val pulse: Int = 1200, val shimmer: Int = 1600, val stagger: Int = 40,
    val pressScale: Float = 0.97f, val pressScaleSurface: Float = 0.99f, val enterScale: Float = 0.95f,
    val snapScale: Float = 1.15f, val growScale: Float = 0.2f, val shiftRise: Float = 6f,
) {
    companion object {
        val Default = PpMotion()
        val Reduced = PpMotion(
            reduced = true,
            press = 1, release = 1, panel = 1, panelExit = 1, slow = 1, grow = 1, mark = 1, draw = 1,
            pulse = 1, shimmer = 1, stagger = 0, pressScale = 1f, pressScaleSurface = 1f,
            enterScale = 1f, snapScale = 1f, growScale = 1f, shiftRise = 0f,
        )
    }
}
