package ru.poputno.common.ui.motion

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.foundation.PpText
import kotlin.math.abs

/** Действие свайпа. Стабильно: экран создаёт его в remember, onTrigger — через rememberUpdatedState. */
@Immutable
class SwipeAction(val label: String, val icon: ImageVector, val color: Color, val onColor: Color)

/**
 * Свайп-действия карточки очереди.
 *
 *  - Палец пишет в float-state синхронно в onDelta: дельты не теряются и не читают
 *    устаревшее значение; доводка — suspend animate() в той же корутине draggable.
 *  - Смещение читается только в graphicsLayer: кадры жеста не вызывают рекомпозицию.
 *    В composition — лишь сторона свайпа (derivedStateOf, меняется 1 раз).
 *  - Сторона без действия заблокирована: смещение прижимается к нулю.
 *  - После срабатывания карточка остаётся за краем: элемент уберёт сам список по ключу,
 *    а если сервер вернул ошибку — карточка вернётся при следующем показе.
 */
@Composable
fun SwipeActions(
    start: SwipeAction?,
    end: SwipeAction?,
    onStart: () -> Unit,
    onEnd: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var offset by remember { mutableFloatStateOf(0f) }
    val width = remember { floatArrayOf(1f) }
    val m = Pp.motion
    val flingPx = with(LocalDensity.current) { 1200.dp.toPx() } // порог скорости, не зависит от плотности
    val startCb by rememberUpdatedState(onStart)
    val endCb by rememberUpdatedState(onEnd)
    val positive by remember { derivedStateOf { offset >= 0f } }
    val action = if (positive) start else end
    val minOffset = if (end == null) 0f else -Float.MAX_VALUE
    val maxOffset = if (start == null) 0f else Float.MAX_VALUE

    Box(modifier.onSizeChanged { width[0] = it.width.toFloat().coerceAtLeast(1f) }.clip(Pp.radii.card)) {
        if (action != null) {
            Row(
                Modifier.matchParentSize()
                    .graphicsLayer { alpha = (abs(offset) / (width[0] * 0.35f)).coerceIn(0f, 1f) }
                    .background(action.color)
                    .padding(horizontal = 24.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = if (positive) Arrangement.Start else Arrangement.End,
            ) {
                Row(
                    Modifier.graphicsLayer {
                        val t = (abs(offset) / (width[0] * 0.35f)).coerceIn(0f, 1f)
                        val s = 0.7f + 0.3f * t
                        scaleX = s; scaleY = s
                    },
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PpIcon(action.icon, size = 22.dp, tint = action.onColor)
                    PpText(action.label, style = Pp.type.label, color = action.onColor)
                }
            }
        }
        Box(
            Modifier
                .graphicsLayer { translationX = offset }
                .draggable(
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { d -> offset = (offset + d).coerceIn(minOffset, maxOffset) },
                    onDragStopped = { velocity ->
                        val w = width[0]
                        val v = offset
                        val fling = abs(velocity) > flingPx && (velocity > 0) == (v > 0)
                        if (v != 0f && (abs(v) > w * 0.35f || fling)) {
                            animate(v, if (v > 0) w else -w, animationSpec = tween(m.base, easing = m.easeOut)) { x, _ -> offset = x }
                            if (v > 0) startCb() else endCb()
                        } else {
                            animate(v, 0f, animationSpec = tween(m.base, easing = m.easeOut)) { x, _ -> offset = x }
                        }
                    },
                ),
        ) { content() }
    }
}

