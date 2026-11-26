package ru.poputno.core.designsystem.foundation

import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.Modifier.Node
import androidx.compose.foundation.Image
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

val LocalContentColor = compositionLocalOf { Color.White }
val LocalTextStyle = compositionLocalOf { TextStyle.Default }

/** Текст дизайн-системы: цвет по умолчанию из [LocalContentColor], стиль из [LocalTextStyle]. */
@Composable
fun PpText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
) {
    val c = if (color.isSpecified) color else style.color.takeIf { it.isSpecified } ?: LocalContentColor.current
    BasicText(text, modifier, style.copy(color = c), maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}

private val Color.isSpecified get() = this != Color.Unspecified

@Composable
fun PpIcon(icon: ImageVector, modifier: Modifier = Modifier, size: Dp = 20.dp, tint: Color = LocalContentColor.current) {
    Image(rememberVectorPainter(icon), null, modifier.size(size), colorFilter = ColorFilter.tint(tint))
}

/**
 * Индикация без ripple: тихая подсветка при hover и нажатии. Масштаб нажатия делают сами
 * компоненты через [pressScale], чтобы сжатие было только у transform, без смены размеров.
 */
object PpIndication : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = Node(interactionSource)
    override fun equals(other: Any?) = other === this
    override fun hashCode() = 7

    private class Node(private val source: InteractionSource) : Modifier.Node(), DrawModifierNode {
        private var pressed = false
        private var hovered = false
        override fun onAttach() {
            coroutineScope.launch {
                source.interactions.collect {
                    when (it) {
                        is PressInteraction.Press -> pressed = true
                        is PressInteraction.Release, is PressInteraction.Cancel -> pressed = false
                        is HoverInteraction.Enter -> hovered = true
                        is HoverInteraction.Exit -> hovered = false
                    }
                    invalidateDraw()
                }
            }
        }
        override fun ContentDrawScope.draw() {
            drawContent()
            val a = when { pressed -> 0.08f; hovered -> 0.05f; else -> 0f }
            if (a > 0f) drawRect(Color.White.copy(alpha = a))
        }
    }
}
