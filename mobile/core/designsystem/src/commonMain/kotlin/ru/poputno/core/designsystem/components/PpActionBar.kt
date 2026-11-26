package ru.poputno.core.designsystem.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.max

/**
 * Панель действий, где подписи кнопок НИКОГДА не обрезаются.
 *
 * Меряет собственную (intrinsic) ширину каждой кнопки:
 *  - всё влезает в строку — кнопки в ряд, свободное место делится поровну (одинаковые отступы
 *    текста, без «Подтве…» из-за весов);
 *  - не влезает — столбец во всю ширину, порядок сохраняется (главное действие объявляйте
 *    последним — оно окажется внизу, под большим пальцем).
 * Решение принимается на этапе layout по фактической ширине, а не по классу окна:
 * работает и на узком телефоне, и при крупном системном шрифте.
 */
@Composable
fun PpActionBar(
    modifier: Modifier = Modifier,
    spacing: Dp = 8.dp,
    content: @Composable () -> Unit,
) {
    Layout(content, modifier) { measurables, constraints ->
        val gap = spacing.roundToPx()
        val maxW = constraints.maxWidth
        val natural = measurables.map { it.maxIntrinsicWidth(constraints.maxHeight) }
        val needed = natural.sum() + gap * (measurables.size - 1).coerceAtLeast(0)
        if (constraints.hasBoundedWidth && needed <= maxW) {
            val extra = (maxW - needed) / measurables.size.coerceAtLeast(1)
            val placeables = measurables.mapIndexed { i, m ->
                val w = natural[i] + extra
                m.measure(Constraints.fixedWidth(w).copy(minHeight = 0, maxHeight = constraints.maxHeight))
            }
            val h = placeables.maxOfOrNull { it.height } ?: 0
            layout(maxW, h) {
                var x = 0
                placeables.forEach { p -> p.placeRelative(x, (h - p.height) / 2); x += p.width + gap }
            }
        } else {
            val w = if (constraints.hasBoundedWidth) maxW else natural.maxOrNull() ?: 0
            val placeables = measurables.map { it.measure(Constraints.fixedWidth(w)) }
            val h = placeables.sumOf { it.height } + gap * (placeables.size - 1).coerceAtLeast(0)
            layout(w, max(h, 0)) {
                var y = 0
                placeables.forEach { p -> p.placeRelative(0, y); y += p.height + gap }
            }
        }
    }
}
