package ru.poputno.feature.brigade.presentation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimation
import ru.poputno.common.camera.presentation.CameraScreen
import ru.poputno.common.ui.motion.frameReveal
import ru.poputno.common.ui.motion.routeShift
import ru.poputno.common.ui.motion.sheetRise
import ru.poputno.core.designsystem.Pp

/** Каждый тип перехода — свой характер движения: деталь «раскрывается из рамки», камера «поднимается». */
@Composable
fun BrigadeContent(component: BrigadeRootComponent, modifier: Modifier = Modifier) {
    val m = Pp.motion
    Children(
        stack = component.stack,
        modifier = modifier,
        animation = stackAnimation { child ->
            when (child.instance) {
                is BrigadeRootComponent.Child.Orders -> routeShift(m)
                is BrigadeRootComponent.Child.Order -> frameReveal(m)
                is BrigadeRootComponent.Child.Camera -> sheetRise(m)
            }
        },
    ) {
        when (val c = it.instance) {
            is BrigadeRootComponent.Child.Orders -> OrdersScreen(c.component)
            is BrigadeRootComponent.Child.Order -> OrderScreen(c.component)
            is BrigadeRootComponent.Child.Camera -> CameraScreen(c.component)
        }
    }
}
