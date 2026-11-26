package ru.poputno.common.map

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.colors
import ru.poputno.core.designsystem.foundation.PpText
import kotlin.math.cos
import kotlin.math.max

/**
 * Схема без подложки: метки по реальным координатам в равнопромежуточной проекции,
 * сетка «кварталов» из токенов карты бренда. Используется там, где нет MapKit.
 */
@Composable
fun SchematicMap(pins: List<MapPin>, modifier: Modifier, selectedId: String?, onPinClick: (String) -> Unit) {
    val c = Pp.colors
    val colors = pins.map { it.status.colors().solid }
    Box(modifier.clip(Pp.radii.card).background(c.surface.sunken)) {
        Canvas(
            Modifier.fillMaxSize().pointerInput(pins) {
                detectTapGestures { tap ->
                    val pos = project(pins, size.width.toFloat(), size.height.toFloat())
                    pos.withIndex().minByOrNull { (_, p) -> (p - tap).getDistance() }
                        ?.takeIf { (_, p) -> (p - tap).getDistance() < 32.dp.toPx() }
                        ?.let { (i, _) -> onPinClick(pins[i].id) }
                }
            },
        ) {
            val step = 28.dp.toPx()
            var x = 0f
            while (x < size.width) { drawLine(c.border.subtle, Offset(x, 0f), Offset(x, size.height), 1f); x += step }
            var y = 0f
            while (y < size.height) { drawLine(c.border.subtle, Offset(0f, y), Offset(size.width, y), 1f); y += step }
            val pos = project(pins, size.width, size.height)
            pos.forEachIndexed { i, p ->
                val r = if (pins[i].id == selectedId) 9.dp.toPx() else 7.dp.toPx()
                drawCircle(c.surface.base, r + 2.dp.toPx(), p)
                drawCircle(colors[i], r, p)
                if (pins[i].id == selectedId) drawCircle(c.accent.scan, r + 6.dp.toPx(), p, style = Stroke(2.dp.toPx()))
            }
        }
        PpText(
            if (pins.isEmpty()) "Нет координат" else "Схема · ${pins.size} на карте",
            style = Pp.type.caption, color = c.text.muted,
            modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
        )
    }
}

/** Точки в пикселях: охват всех меток с полем 12 %, поправка долготы на широту. */
private fun project(pins: List<MapPin>, w: Float, h: Float): List<Offset> {
    if (pins.isEmpty()) return emptyList()
    val k = cos(pins.first().point.lat * kotlin.math.PI / 180).toFloat()
    val xs = pins.map { it.point.lon.toFloat() * k }; val ys = pins.map { it.point.lat.toFloat() }
    val minX = xs.min(); val maxX = xs.max(); val minY = ys.min(); val maxY = ys.max()
    val span = max(max(maxX - minX, maxY - minY), 0.002f)
    val pad = 0.12f
    val scale = minOf(w, h) * (1 - 2 * pad) / span
    val cx = (minX + maxX) / 2; val cy = (minY + maxY) / 2
    return pins.indices.map { i -> Offset(w / 2 + (xs[i] - cx) * scale, h / 2 - (ys[i] - cy) * scale) }
}
