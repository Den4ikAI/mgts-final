package ru.poputno.shared.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.padding
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpMarkProgress
import ru.poputno.core.designsystem.components.drawMark
import ru.poputno.core.designsystem.foundation.PpText

/**
 * Сплэш «попутно». Сценарий по брендбуку:
 *  1. линия маршрута прорисовывается слева направо (машина едет);
 *  2. уголки рамки и точка-объект появляются ОДНОВРЕМЕННО (камера заметила объект);
 *  3. слово «попутно» проявляется вдоль той же линии слева направо, следом — обещание;
 *  4. выход: знак «приближается» (камера наводится), сплэш растворяется в приложение,
 *     которое уже собрано под ним — без пустого кадра.
 * Всё — draw/graphicsLayer, композиция сплэша не пересчитывается на кадрах.
 * «Меньше движения»: без сдвигов и масштаба, короткий фейд.
 */
@Composable
fun Splash(onFinished: () -> Unit) {
    val c = Pp.colors
    val m = Pp.motion
    val done by rememberUpdatedState(onFinished)
    val mark = remember { PpMarkProgress() }
    val word = remember { Animatable(0f) }
    val tagline = remember { Animatable(0f) }
    val exit = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        if (m.reduced) {
            mark.showStatic(); word.snapTo(1f); tagline.snapTo(1f)
            delay(500)
        } else {
            mark.play(routeMs = 620, frameMs = 380, motion = m)
            launch { word.animateTo(1f, tween(520, easing = m.easeRoute)) }
            delay(260)
            tagline.animateTo(1f, tween(360, easing = m.easeOut))
            delay(420)
        }
        exit.animateTo(1f, tween(if (m.reduced) 200 else 420, easing = m.easeInOut))
        done()
    }

    val markColor = c.logo.mark
    val dotColor = c.logo.dot
    val snap = m.snapScale
    val rise = if (m.reduced) 0f else 10f
    Box(
        Modifier.fillMaxSize()
            .graphicsLayer { alpha = 1f - exit.value }
            .background(c.surface.sunken)
            // сплэш перехватывает ввод, пока виден: тап не уйдёт в экран входа под ним
            .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent() } },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Canvas(
                Modifier.size(112.dp).graphicsLayer {
                    val s = if (m.reduced) 1f else 1f + 0.5f * exit.value
                    scaleX = s; scaleY = s
                },
            ) { drawMark(mark.route.value, mark.frame.value, markColor, dotColor, snap) }
            PpText(
                "попутно",
                style = Pp.type.h1,
                color = c.logo.word,
                modifier = Modifier
                    .graphicsLayer { translationX = (1f - word.value) * -rise.dp.toPx() }
                    .drawWithContent { clipRect(right = size.width * word.value) { this@drawWithContent.drawContent() } },
            )
            PpText(
                "Машины уже едут. Инфраструктуру проверяем попутно.",
                style = Pp.type.bodySm.copy(textAlign = TextAlign.Center),
                color = c.text.muted,
                modifier = Modifier.padding(horizontal = 32.dp).graphicsLayer {
                    alpha = tagline.value
                    translationY = (1f - tagline.value) * rise.dp.toPx()
                },
            )
        }
    }
}
