package ru.poputno.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.icons.PpIcons
import ru.poputno.core.designsystem.tokens.PpColors

/** Статус объекта на уровне UI. Всегда цвет + иконка + слово; «Не наблюдается» — пунктир. */
enum class PpStatus(val label: String) {
    Ok("Норма"), Suspected("Проверить"), Defect("Дефект"), Critical("Критично"), NotObserved("Не наблюдается");

    val icon: ImageVector get() = when (this) {
        Ok -> PpIcons.StatusOk; Suspected -> PpIcons.StatusSuspected; Defect -> PpIcons.StatusDefect
        Critical -> PpIcons.StatusCritical; NotObserved -> PpIcons.StatusNotObserved
    }
}

@Composable @ReadOnlyComposable
fun PpStatus.colors(): PpColors.StatusColors = with(Pp.colors.status) {
    when (this@colors) {
        PpStatus.Ok -> ok; PpStatus.Suspected -> suspected; PpStatus.Defect -> defect
        PpStatus.Critical -> critical; PpStatus.NotObserved -> notObserved
    }
}

@Composable
fun PpStatusPill(status: PpStatus, modifier: Modifier = Modifier, compact: Boolean = false) {
    val sc = status.colors()
    val shape = Pp.radii.pill
    val dashed = status == PpStatus.NotObserved
    Row(
        modifier
            .clip(shape)
            .background(sc.bg)
            .then(
                if (dashed) Modifier.drawBehind {
                    drawRoundRect(
                        sc.border, cornerRadius = CornerRadius(size.height / 2),
                        style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 3f))),
                    )
                } else Modifier.border(1.dp, sc.border, shape),
            )
            .padding(horizontal = if (compact) 8.dp else 10.dp, vertical = if (compact) 2.dp else 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PpIcon(status.icon, size = if (compact) 12.dp else 14.dp, tint = sc.icon)
        PpText(status.label, style = Pp.type.label, color = sc.fg, maxLines = 1)
    }
}

/** Точка статуса (метка списка/карты). */
@Composable
fun PpStatusDot(status: PpStatus, modifier: Modifier = Modifier) {
    val sc = status.colors()
    Box(modifier.size(10.dp).clip(Pp.radii.pill).background(sc.solid).border(2.dp, Pp.colors.surface.base, Pp.radii.pill))
}

/** Опасность 1..4: читается по числу столбиков, не только по цвету. */
@Composable
fun PpSeverity(level: Int, modifier: Modifier = Modifier) {
    val s = Pp.colors.severity
    val color = when (level) { 1 -> s.low; 2 -> s.medium; 3 -> s.high; else -> s.critical }
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
        repeat(4) { i ->
            Box(
                Modifier.width(4.dp).height((6 + i * 3).dp).clip(Pp.radii.tag)
                    .background(if (i < level) color else s.track),
            )
        }
    }
}

/**
 * Бейдж происхождения: «модель» — циан в уголках, «человек» — сплошная линия.
 * [onMedia] — поверх фото: стеклянная тёмная подложка и светлый текст, иначе на светлом
 * снимке полупрозрачный циан нечитаем.
 */
@Composable
fun PpProvenance(byModel: Boolean, confidence: Double? = null, modifier: Modifier = Modifier, onMedia: Boolean = false) {
    val c = Pp.colors
    val p = if (onMedia) c.provenance.copy(
        modelFg = c.accent.scan, modelBg = c.surface.sunken.copy(alpha = 0.72f),
        human = c.onMedia, humanBg = c.surface.sunken.copy(alpha = 0.72f),
    ) else c.provenance
    Row(
        modifier.clip(Pp.radii.tag).background(if (byModel) p.modelBg else p.humanBg)
            .then(if (byModel) Modifier.drawBehind { cornerTicks(p.model) } else Modifier.border(1.dp, p.human.copy(alpha = 0.4f), Pp.radii.tag))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PpIcon(if (byModel) PpIcons.Frame else PpIcons.UserCheck, size = 14.dp, tint = if (byModel) p.modelFg else p.human)
        PpText(if (byModel) "модель" else "человек", style = Pp.type.caption, color = if (onMedia) c.onMedia else if (byModel) p.modelFg else p.human, maxLines = 1)
        confidence?.let { PpText(it.formatConf(), style = Pp.type.monoSm, color = if (byModel) p.modelFg else p.human, maxLines = 1) }
    }
}

fun Double.formatConf(): String {
    val v = (this * 100).toInt().coerceIn(0, 100)
    return "0." + v.toString().padStart(2, '0')
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.cornerTicks(color: androidx.compose.ui.graphics.Color) {
    val a = 5.dp.toPx(); val w = 1.5.dp.toPx()
    val r = size.width; val b = size.height
    listOf(0f to 0f, r to 0f, r to b, 0f to b).forEach { (x, y) ->
        val dx = if (x == 0f) a else -a; val dy = if (y == 0f) a else -a
        drawLine(color, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Offset(x + dx, y), w)
        drawLine(color, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Offset(x, y + dy), w)
    }
}

