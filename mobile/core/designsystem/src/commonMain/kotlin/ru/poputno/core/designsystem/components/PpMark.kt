package ru.poputno.core.designsystem.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.inset
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.foundation.PpText

/** Фазы анимации знака, общие для знака, загрузчика и сплэша. */
class PpMarkProgress {
    /** Линия маршрута 0…1 слева направо. */
    val route = Animatable(0f)
    /** Уголки и точка вместе 0…1. */
    val frame = Animatable(0f)

    suspend fun play(routeMs: Int, frameMs: Int, motion: ru.poputno.core.designsystem.tokens.PpMotion) {
        route.snapTo(0f); frame.snapTo(0f)
        route.animateTo(1f, tween(routeMs, easing = motion.easeRoute))
        frame.animateTo(1f, tween(frameMs, easing = motion.easeOut))
    }

    suspend fun showStatic() { route.snapTo(1f); frame.snapTo(1f) }
}

/**
 * Знак «Попутно» на сетке 64. Анимация по брендбуку: сначала слева направо прорисовывается
 * линия маршрута, затем ОДНОВРЕМЕННО появляются уголки рамки (защёлкиваются из 1.15) и
 * точка-объект. Значения читаются только в draw-фазе Canvas.
 */
@Composable
fun PpMark(
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
    animate: Boolean = true,
    loop: Boolean = false,
    tint: Color = Color.Unspecified,
    progress: PpMarkProgress? = null,
) {
    val c = Pp.colors
    val m = Pp.motion
    val p = progress ?: remember { PpMarkProgress() }
    if (progress == null) {
        LaunchedEffect(animate, loop) {
            if (!animate) { p.showStatic(); return@LaunchedEffect }
            do {
                p.play(m.mark * 55 / 100, m.mark * 45 / 100, m)
                if (loop) delay(500)
            } while (loop)
        }
    }
    val markColor = if (tint == Color.Unspecified) c.logo.mark else tint
    val dotColor = if (tint == Color.Unspecified) c.logo.dot else tint
    val snap = m.snapScale
    Canvas(modifier.size(size)) { drawMark(p.route.value, p.frame.value, markColor, dotColor, snap) }
}

fun DrawScope.drawMark(route: Float, frame: Float, markColor: Color, dotColor: Color, snapScale: Float) {
    val u = size.width / 64f
    if (route > 0f) clipRect(right = size.width * route) {
        drawRect(markColor, Offset(0f, 29 * u), Size(21 * u, 6 * u))
        drawRect(markColor, Offset(43 * u, 29 * u), Size(21 * u, 6 * u))
    }
    if (frame <= 0f) return
    val s = snapScale + (1f - snapScale) * frame
    val center = Offset(32 * u, 32 * u)
    scale(s, center) { drawCorners(markColor, u, frame) }
    drawCircle(dotColor, radius = 8 * u * (0.4f + 0.6f * frame), center = center, alpha = frame)
}

private fun DrawScope.drawCorners(color: Color, u: Float, alpha: Float) {
    val w = 6 * u; val arm = 17 * u; val r = CornerRadius(2 * u)
    for ((x, y) in CORNERS) {
        val left = x < 32; val top = y < 32
        val hx = if (left) x * u else x * u - arm
        val vy = if (top) y * u else y * u - arm
        val hy = if (top) y * u else y * u - w
        val vx = if (left) x * u else x * u - w
        drawRoundRect(color, Offset(hx, hy), Size(arm, w), r, alpha = alpha)
        drawRoundRect(color, Offset(vx, vy), Size(w, arm), r, alpha = alpha)
    }
}

private val CORNERS = arrayOf(8f to 8f, 56f to 8f, 56f to 56f, 8f to 56f)

/** Логотип: знак + слово «попутно» (Unbounded 600, строчные). */
@Composable
fun PpLogo(modifier: Modifier = Modifier, height: Dp = 28.dp, animate: Boolean = false) {
    val h2 = Pp.type.h2
    val style = remember(h2, height) { h2.copy(fontSize = h2.fontSize * (height.value / 28f) * 0.8f) }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(height * 0.32f)) {
        PpMark(size = height, animate = animate)
        PpText("попутно", style = style, color = Pp.colors.logo.word)
    }
}

/**
 * Загрузчик = знак в цикле. Появляется с задержкой 400 мс (не мигает на быстрых ответах),
 * затем проявляется прозрачностью в graphicsLayer — без рекомпозиций на кадр.
 */
@Composable
fun PpLoader(modifier: Modifier = Modifier, size: Dp = 40.dp) {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) { delay(400); alpha.animateTo(1f, tween(200)) }
    PpMark(modifier.graphicsLayer { this.alpha = alpha.value }, size = size, loop = true)
}

/**
 * Иконка приложения как Painter (окно desktop, превью): плитка navy + полный знак.
 * Геометрия та же, что у анимированного знака, — единый источник.
 */
class PpAppIconPainter(
    private val tile: Color = ru.poputno.core.designsystem.tokens.PpPalette.Navy.s900,
    private val mark: Color = ru.poputno.core.designsystem.tokens.PpPalette.Signal.s400,
    private val dot: Color = ru.poputno.core.designsystem.tokens.PpPalette.Scan.s400,
) : androidx.compose.ui.graphics.painter.Painter() {
    override val intrinsicSize: Size = Size(256f, 256f)
    override fun DrawScope.onDraw() {
        drawRoundRect(tile, cornerRadius = CornerRadius(size.minDimension * 0.22f))
        val inset = size.minDimension * 0.14f
        inset(inset) { drawMark(1f, 1f, mark, dot, 1f) }
    }
}
