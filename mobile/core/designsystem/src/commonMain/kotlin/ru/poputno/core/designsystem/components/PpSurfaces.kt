package ru.poputno.core.designsystem.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.foundation.detectionCorners
import ru.poputno.core.designsystem.foundation.pressScale

/**
 * Карточка. Выбранная — не «поднимается» тенью, а получает уголки рамки детекции
 * (фирменный приём), которые защёлкиваются к краям.
 */
@Composable
fun PpCard(
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = Pp.colors
    val m = Pp.motion
    val snap = remember { Animatable(if (selected) 1f else 0f) }
    LaunchedEffect(selected) { snap.animateTo(if (selected) 1f else 0f, tween(if (selected) m.slow else m.exit, easing = m.easeOut)) }
    val source = remember { MutableInteractionSource() }
    Column(
        modifier
            .then(if (onClick != null) Modifier.pressScale(source, m.pressScaleSurface) else Modifier)
            .detectionCorners(c.accent.scan, arm = 12.dp, inset = (-3).dp, progress = { snap.value }, snapFrom = m.snapScale)
            .clip(Pp.radii.card)
            .background(if (selected) c.surface.selected else c.surface.raised)
            .border(1.dp, c.border.subtle, Pp.radii.card)
            .then(if (onClick != null) Modifier.clickable(source, androidx.compose.foundation.LocalIndication.current, onClick = onClick) else Modifier)
            .padding(Pp.space.card),
        verticalArrangement = Arrangement.spacedBy(Pp.space.x3),
        content = content,
    )
}

/** Поле ввода: подпись сверху, фокус — циановое кольцо на тёмном, ошибка — текстом снизу. */
@Composable
fun PpTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    error: String? = null,
    password: Boolean = false,
    mono: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    val c = Pp.colors
    var focused by remember { mutableStateOf(false) }
    val ring = when { error != null -> c.text.danger; focused -> c.focusRing; else -> c.border.default }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PpText(label, style = Pp.type.label, color = c.text.secondary)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = (if (mono) Pp.type.mono else Pp.type.body).copy(color = c.text.primary),
            cursorBrush = SolidColor(c.accent.scan),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboardType),
            modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            decorationBox = { inner ->
                Box(
                    Modifier.fillMaxWidth().height(Pp.sizes.controlLg).clip(Pp.radii.control)
                        .background(c.surface.sunken)
                        .border(if (focused) 2.dp else 1.dp, ring, Pp.radii.control)
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (value.isEmpty()) PpText(placeholder, style = Pp.type.body, color = c.text.muted)
                    inner()
                }
            },
        )
        error?.let { PpText(it, style = Pp.type.caption, color = c.text.danger) }
    }
}

/** Сегменты. Выбранный сегмент — подложка, которая «переезжает» под палец. */
@Composable
fun <T> PpSegmented(items: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val c = Pp.colors
    Row(
        modifier.clip(Pp.radii.pill).background(c.action.secondary).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        items.forEach { item ->
            val on = item == selected
            Box(
                Modifier.clip(Pp.radii.pill)
                    .background(if (on) c.surface.overlay else Color.Transparent)
                    .clickable { onSelect(item) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
            ) { PpText(label(item), style = Pp.type.label, color = if (on) c.text.primary else c.text.muted) }
        }
    }
}

/** Плитка KPI: цифра Unbounded (жидкий кегль), подпись Golos. */
@Composable
fun PpKpi(label: String, value: String, modifier: Modifier = Modifier, unit: String? = null, accent: Boolean = false) {
    val c = Pp.colors
    Column(
        modifier.clip(Pp.radii.card).background(c.surface.raised).border(1.dp, c.border.subtle, Pp.radii.card).padding(Pp.space.card),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PpText(label.uppercase(), style = Pp.type.micro, color = c.text.muted)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PpText(value, style = Pp.type.kpi, color = if (accent) c.accent.strong else c.text.primary)
            unit?.let { PpText(it, style = Pp.type.bodySm, color = c.text.muted, modifier = Modifier.padding(bottom = 4.dp)) }
        }
    }
}

@Composable
fun PpBadge(text: String, modifier: Modifier = Modifier, accent: Boolean = false) {
    val c = Pp.colors
    Box(
        modifier.clip(Pp.radii.pill).background(if (accent) c.accent.base else c.action.secondary).padding(horizontal = 8.dp, vertical = 2.dp),
    ) { PpText(text, style = Pp.type.monoSm, color = if (accent) c.text.onAccent else c.text.secondary) }
}

/** Тонкий разделитель-«линия маршрута». */
@Composable
fun PpRouteDivider(modifier: Modifier = Modifier, accent: Boolean = false) {
    val c = Pp.colors
    Box(modifier.fillMaxWidth().height(if (accent) 2.dp else 1.dp).background(if (accent) c.route.line else c.border.subtle))
}

/** Строка секции: микро-заголовок + действие справа. */
@Composable
fun PpSectionHeader(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        PpText(title.uppercase(), style = Pp.type.micro, color = Pp.colors.text.muted, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** Скелетон: тихий шиммер прозрачностью (не движением). */
@Composable
fun PpSkeleton(modifier: Modifier = Modifier) {
    val a = remember { Animatable(0.5f) }
    val m = Pp.motion
    LaunchedEffect(Unit) {
        while (true) { a.animateTo(1f, tween(m.shimmer / 2, easing = m.linear)); a.animateTo(0.5f, tween(m.shimmer / 2, easing = m.linear)) }
    }
    Box(modifier.graphicsLayer { alpha = a.value }.clip(Pp.radii.compact).background(Pp.colors.surface.skeleton))
}
