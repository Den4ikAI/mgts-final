package ru.poputno.core.designsystem.foundation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp

/**
 * Сжатие при нажатии. Анимированное значение читается только внутри graphicsLayer:
 * кадры анимации меняют слой, без рекомпозиции и релейаута. Рекомпозиция — лишь на
 * смене pressed (2 раза за нажатие).
 */
@Composable
fun Modifier.pressScale(source: InteractionSource, scale: Float = Pp.motion.pressScale): Modifier {
    val pressed = source.collectIsPressedAsState()
    val m = Pp.motion
    val s = animateFloatAsState(
        if (pressed.value) scale else 1f,
        tween(if (pressed.value) m.press else m.release, easing = m.easeOut),
    )
    return graphicsLayer { scaleX = s.value; scaleY = s.value }
}

/**
 * Фирменный приём: четыре уголка рамки детекции вокруг содержимого.
 *
 * Path строится один раз на размер (drawWithCache), а «защёлкивание» [progress] 0…1 —
 * это только scale + alpha в draw-фазе: кадр анимации ничего не аллоцирует и не
 * вызывает рекомпозицию.
 */
fun Modifier.detectionCorners(
    color: Color,
    arm: Dp = 14.dp,
    stroke: Dp = 2.dp,
    inset: Dp = 0.dp,
    progress: () -> Float = { 1f },
    snapFrom: Float = 1.15f,
): Modifier = drawWithCache {
    val a = arm.toPx(); val w = stroke.toPx(); val i = inset.toPx()
    val l = i + w / 2; val t = i + w / 2; val r = size.width - i - w / 2; val b = size.height - i - w / 2
    val path = Path().apply {
        moveTo(l, t + a); lineTo(l, t); lineTo(l + a, t)
        moveTo(r - a, t); lineTo(r, t); lineTo(r, t + a)
        moveTo(r, b - a); lineTo(r, b); lineTo(r - a, b)
        moveTo(l + a, b); lineTo(l, b); lineTo(l, b - a)
    }
    val style = Stroke(w, cap = StrokeCap.Round, join = StrokeJoin.Round)
    onDrawWithContent {
        drawContent()
        val p = progress().coerceIn(0f, 1f)
        if (p <= 0f) return@onDrawWithContent
        val s = snapFrom + (1f - snapFrom) * p
        scale(s) { drawPath(path, color, alpha = p, style = style) }
    }
}
