package ru.poputno.core.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.foundation.PpText

/**
 * Шаги на «линии маршрута»: узлы-точки, пройденная часть прорисовывается signal.
 * Используется в камере (общий план → дефект → ID объекта) и в наряде.
 */
@Composable
fun PpRouteSteps(
    steps: List<String>,
    current: Int,
    modifier: Modifier = Modifier,
    onMedia: Boolean = false,
) {
    val c = Pp.colors
    val m = Pp.motion
    val progress by animateFloatAsState(
        if (steps.size <= 1) 1f else current.toFloat() / (steps.size - 1),
        tween(m.draw, easing = m.easeRoute),
    )
    val track = if (onMedia) c.onMedia.copy(alpha = 0.25f) else c.route.track
    val line = c.route.line
    val labelDone = if (onMedia) c.onMedia else c.text.primary
    val labelTodo = if (onMedia) c.onMediaMuted else c.text.muted
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(Modifier.fillMaxWidth().height(14.dp)) {
            val y = size.height / 2
            val r = 5.dp.toPx()
            val x0 = r; val x1 = size.width - r
            drawLine(track, Offset(x0, y), Offset(x1, y), 2.dp.toPx(), StrokeCap.Round)
            drawLine(line, Offset(x0, y), Offset(x0 + (x1 - x0) * progress, y), 2.dp.toPx(), StrokeCap.Round)
            steps.indices.forEach { i ->
                val x = if (steps.size == 1) x0 else x0 + (x1 - x0) * i / (steps.size - 1)
                val done = i <= current
                drawCircle(if (done) line else c.route.node, r, Offset(x, y))
                drawCircle(if (done) line else track, r, Offset(x, y), style = Stroke(2.dp.toPx()))
                if (i == current) drawCircle(c.accent.scan, r * 0.45f, Offset(x, y))
            }
        }
        // подпись стоит под своим узлом (центр), у краёв прижимается внутрь — не вылезает и не съезжает
        Layout(
            content = {
                steps.forEachIndexed { i, label ->
                    PpText(label, style = Pp.type.caption, color = if (i <= current) labelDone else labelTodo, maxLines = 1)
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { measurables, constraints ->
            val w = constraints.maxWidth
            val r = 5.dp.roundToPx()
            val slot = if (steps.size > 1) (w - 2 * r) / (steps.size - 1) else w
            val placeables = measurables.map { it.measure(Constraints(maxWidth = slot.coerceAtLeast(1).coerceAtMost(w))) }
            val h = placeables.maxOfOrNull { it.height } ?: 0
            layout(w, h) {
                placeables.forEachIndexed { i, p ->
                    val node = if (steps.size == 1) w / 2 else r + (w - 2 * r) * i / (steps.size - 1)
                    p.placeRelative((node - p.width / 2).coerceIn(0, (w - p.width).coerceAtLeast(0)), 0)
                }
            }
        }
    }
}

/** Прогресс-линия маршрута (0…1). */
@Composable
fun PpRouteProgress(value: Float, modifier: Modifier = Modifier) {
    val c = Pp.colors
    val v by animateFloatAsState(value.coerceIn(0f, 1f), tween(Pp.motion.slow, easing = Pp.motion.easeOut))
    Canvas(modifier.fillMaxWidth().height(4.dp)) {
        val y = size.height / 2
        drawLine(c.route.track, Offset(0f, y), Offset(size.width, y), size.height, StrokeCap.Round)
        if (v > 0f) drawLine(c.route.line, Offset(0f, y), Offset(size.width * v, y), size.height, StrokeCap.Round)
    }
}

/** Вертикальный таймлайн наряда: узлы на линии маршрута. */
@Composable
fun PpTimelineItem(time: String, text: String, done: Boolean, last: Boolean = false) {
    val c = Pp.colors
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.width(14.dp).height(if (last) 20.dp else 52.dp)) {
            Canvas(Modifier.size(14.dp, if (last) 20.dp else 52.dp)) {
                val x = size.width / 2
                if (!last) drawLine(if (done) c.route.line else c.route.track, Offset(x, 14.dp.toPx()), Offset(x, size.height), 2.dp.toPx())
                drawCircle(if (done) c.route.line else c.route.track, 5.dp.toPx(), Offset(x, 7.dp.toPx()))
            }
        }
        Column(Modifier.padding(bottom = 8.dp)) {
            PpText(time, style = Pp.type.monoSm, color = c.text.muted)
            PpText(text, style = Pp.type.bodySm, color = if (done) c.text.primary else c.text.secondary)
        }
    }
}

/** Пустое состояние: иконка в уголках рамки («ничего не замечено»). */
@Composable
fun PpEmpty(title: String, text: String, modifier: Modifier = Modifier) {
    val c = Pp.colors
    Column(modifier.fillMaxWidth().padding(Pp.space.section), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PpMark(size = 48.dp, animate = false, tint = Color.Unspecified)
        PpText(title, style = Pp.type.title)
        PpText(text, style = Pp.type.bodySm, color = c.text.muted)
    }
}

