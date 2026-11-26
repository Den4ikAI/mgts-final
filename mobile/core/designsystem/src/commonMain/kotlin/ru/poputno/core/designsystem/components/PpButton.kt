package ru.poputno.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.foundation.LocalContentColor
import ru.poputno.core.designsystem.foundation.LocalTextStyle
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.foundation.pressScale

enum class PpButtonVariant { Primary, Secondary, Ghost, Danger, Scan }
enum class PpButtonSize(val height: Dp, val hPad: Dp) { Sm(32.dp, 12.dp), Md(40.dp, 16.dp), Lg(48.dp, 20.dp) }

/**
 * Кнопка. Одна Primary на экран. Форма — радиус md (8), у капсульных контролов камеры — pill.
 * Нет ripple и теней: цвет, тонкая линия и сжатие при нажатии.
 */
@Composable
fun PpButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: PpButtonVariant = PpButtonVariant.Primary,
    size: PpButtonSize = PpButtonSize.Md,
    leading: ImageVector? = null,
    trailing: ImageVector? = null,
    enabled: Boolean = true,
    shape: Shape = Pp.radii.control,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val hovered by source.collectIsHoveredAsState()
    val c = Pp.colors
    val (bg, fg, line) = when (variant) {
        PpButtonVariant.Primary -> Triple(
            if (pressed) c.action.primaryPress else if (hovered) c.action.primaryHover else c.action.primary,
            c.text.onAccent, Color.Transparent,
        )
        PpButtonVariant.Secondary -> Triple(
            if (pressed) c.action.secondaryPress else if (hovered) c.action.secondaryHover else c.action.secondary,
            c.action.secondaryFg, c.border.default,
        )
        PpButtonVariant.Ghost -> Triple(
            if (pressed) c.action.ghostPress else if (hovered) c.action.ghostHover else Color.Transparent,
            c.text.primary, Color.Transparent,
        )
        PpButtonVariant.Danger -> Triple(
            if (pressed) c.action.dangerPress else if (hovered) c.action.dangerHover else c.action.danger,
            c.text.onAccent, Color.Transparent,
        )
        PpButtonVariant.Scan -> Triple(c.accent.scan, c.text.onScan, Color.Transparent)
    }
    val finalBg = if (enabled) bg else c.action.disabled
    val finalFg = if (enabled) fg else c.text.disabled
    Row(
        modifier
            .pressScale(source)
            .defaultMinSize(minHeight = size.height)
            .clip(shape)
            .background(finalBg)
            .border(1.dp, line, shape)
            .clickable(source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(PaddingValues(horizontal = size.hPad)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        CompositionLocalProvider(LocalContentColor provides finalFg, LocalTextStyle provides Pp.type.label) {
            leading?.let { PpIcon(it, size = 18.dp) }
            PpText(text, maxLines = 1)
            trailing?.let { PpIcon(it, size = 18.dp) }
        }
    }
}

/**
 * Круглая/капсульная кнопка-иконка. На тёмном — стеклянная подложка, на фото — [onMedia].
 * Используется в камере, панелях карты, шапках.
 */
@Composable
fun PpIconButton(
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    active: Boolean = false,
    onMedia: Boolean = false,
    contentDescription: String? = null,
) {
    val source = remember { MutableInteractionSource() }
    val c = Pp.colors
    val bg = when {
        active -> c.accent.scan
        onMedia -> c.surface.sunken.copy(alpha = 0.55f)
        else -> c.action.secondary
    }
    val fg = when {
        active -> c.text.onScan
        onMedia -> c.onMedia
        else -> c.text.primary
    }
    Box(
        modifier
            .pressScale(source, 0.92f)
            .size(size)
            .clip(Pp.radii.pill)
            .background(bg)
            .border(1.dp, if (active) Color.Transparent else c.onMedia.copy(alpha = if (onMedia) 0.18f else 0f), Pp.radii.pill)
            .clickable(source, indication = androidx.compose.foundation.LocalIndication.current, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { PpIcon(icon, size = size * 0.48f, tint = fg) }
}
