package ru.poputno.common.ui.motion

import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.extensions.compose.stack.animation.Direction
import com.arkivanov.decompose.extensions.compose.stack.animation.StackAnimator
import com.arkivanov.decompose.extensions.compose.stack.animation.isFront
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimator
import ru.poputno.core.designsystem.tokens.PpMotion
import kotlin.math.abs

/*
 * Переходы навигации «Попутно». Три характера вместо одного «свайпа вправо»:
 *
 *  routeShift  — соседние экраны одного уровня: короткий сдвиг вдоль «линии маршрута»
 *                (24 dp, не на всю ширину) + фейд. Задний экран чуть отступает вглубь.
 *  frameReveal — переход к объекту/детали: экран раскрывается из скруглённой «рамки детекции»
 *                (масштаб 0.92 → 1, радиус 28 → 0 dp), как камера «замечает» объект.
 *  sheetRise   — камера и модальные шаги: поднимается снизу, задний экран уходит
 *                в глубину (scale 0.94 + затемнение) — как перевернуть телефон к объекту.
 *
 * Все три — только graphicsLayer (transform, alpha, clip). Layout не меняется, поэтому
 * прерывание жестом назад или быстрые повторные нажатия не «ломают» кадр: Decompose
 * просто доигрывает factor от текущего значения. Длительности берутся из PpMotion,
 * в режиме «меньше движения» сдвиги и масштаб обнуляются, остаётся фейд.
 */

fun routeShift(m: PpMotion): StackAnimator = stackAnimator(tween(m.panel, easing = m.easeOut)) { factor, direction, content ->
    val f = abs(factor)
    val shift = if (m.reduced) 0f else 24f
    content(
        Modifier.graphicsLayer {
            translationX = factor * shift.dp.toPx()
            alpha = if (direction.isFront) 1f - f else 1f - f * 0.6f
            val s = if (direction.isFront || m.reduced) 1f else 1f - f * 0.03f
            scaleX = s; scaleY = s
        },
    )
}

fun frameReveal(m: PpMotion): StackAnimator = stackAnimator(tween(m.slow, easing = m.easeOut)) { factor, direction, content ->
    val f = abs(factor)
    content(
        if (direction.isFront) {
            Modifier.graphicsLayer {
                val s = if (m.reduced) 1f else 1f - f * 0.08f
                scaleX = s; scaleY = s
                alpha = 1f - f
                shape = RoundedCornerShape((28 * f).dp)
                clip = f > 0f
            }
        } else {
            Modifier.graphicsLayer { alpha = 1f - f * 0.7f }
        },
    )
}

fun sheetRise(m: PpMotion): StackAnimator = stackAnimator(tween(m.panel + 60, easing = m.easeDrawer)) { factor, direction, content ->
    val f = abs(factor)
    content(
        if (direction.isFront) {
            Modifier.graphicsLayer {
                translationY = if (m.reduced) 0f else f * size.height
                alpha = if (m.reduced) 1f - f else 1f
                shape = RoundedCornerShape(topStart = (24 * f).dp, topEnd = (24 * f).dp)
                clip = f > 0f
            }
        } else {
            Modifier.graphicsLayer {
                val s = if (m.reduced) 1f else 1f - f * 0.06f
                scaleX = s; scaleY = s
                alpha = 1f - f * 0.5f
            }
        },
    )
}

