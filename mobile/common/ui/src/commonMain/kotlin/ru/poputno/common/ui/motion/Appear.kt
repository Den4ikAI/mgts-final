package ru.poputno.common.ui.motion

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.node.LayoutModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.tokens.PpMotion

/**
 * Какие элементы списка уже «появились». Живёт на уровне экрана: при прокрутке назад
 * элемент не анимируется повторно, а новые (пришли с сервера) — анимируются.
 */
@Stable
class AppearRegistry {
    private val played = HashSet<Any>()
    internal fun markPlayed(key: Any): Boolean = played.add(key)
    internal fun wasPlayed(key: Any) = key in played
}

@Composable
fun rememberAppearRegistry() = remember { AppearRegistry() }

/**
 * Появление: фейд + подъём на shiftRise, задержка stagger × index (не больше 8 шагов —
 * длинные списки не «ползут»). Реализовано как Modifier.Node: анимация живёт в узле,
 * значение читается в слое, рекомпозиции нет ни на одном кадре.
 */
@Composable
fun Modifier.appear(index: Int, key: Any = index, registry: AppearRegistry? = null): Modifier =
    this then AppearElement(index, key, registry, Pp.motion)

private data class AppearElement(
    val index: Int,
    val key: Any,
    val registry: AppearRegistry?,
    val motion: PpMotion,
) : ModifierNodeElement<AppearNode>() {
    override fun create() = AppearNode(index, key, registry, motion)
    override fun update(node: AppearNode) = Unit // анимация привязана к первому появлению
}

private class AppearNode(
    private val index: Int,
    private val key: Any,
    private val registry: AppearRegistry?,
    private val motion: PpMotion,
) : Modifier.Node(), LayoutModifierNode {
    private val progress = Animatable(if (registry?.wasPlayed(key) == true) 1f else 0f)

    override fun onAttach() {
        if (progress.value >= 1f) return
        registry?.markPlayed(key)
        coroutineScope.launch {
            delay((index.coerceIn(0, 8) * motion.stagger).toLong())
            progress.animateTo(1f, tween(motion.slow, easing = motion.easeOut))
        }
    }

    override fun MeasureScope.measure(measurable: Measurable, constraints: Constraints): MeasureResult {
        val placeable = measurable.measure(constraints)
        val rise = (motion.shiftRise * 2).dp.toPx()
        return layout(placeable.width, placeable.height) {
            placeable.placeWithLayer(0, 0) {
                val v = progress.value
                alpha = v
                translationY = (1f - v) * rise
            }
        }
    }
}

