package ru.poputno.feature.brigade.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.pop
import com.arkivanov.decompose.router.stack.popWhile
import com.arkivanov.decompose.router.stack.pushNew
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import ru.poputno.common.camera.presentation.CameraComponent
import ru.poputno.common.domain.model.PhotoStage
import ru.poputno.feature.brigade.di.BrigadeGraph

/** Навигация бригады: список → наряд → камера. Конфигурации сериализуемы: стек переживает смерть процесса. */
class BrigadeRootComponent(
    context: ComponentContext,
    private val graph: BrigadeGraph,
    private val brigadeId: String,
) : ComponentContext by context {

    @Serializable
    sealed interface Config {
        @Serializable data object Orders : Config
        @Serializable data class Order(val id: String) : Config
        @Serializable data class Camera(val orderId: String, val objectId: String, val title: String, val subtitle: String, val stage: PhotoStage) : Config
    }

    sealed interface Child {
        class Orders(val component: OrdersComponent) : Child
        class Order(val component: OrderComponent) : Child
        class Camera(val component: CameraComponent) : Child
    }

    private val nav = StackNavigation<Config>()
    private val scope = coroutineScope()

    val stack: Value<ChildStack<Config, Child>> = childStack(
        source = nav,
        serializer = Config.serializer(),
        initialConfiguration = Config.Orders,
        handleBackButton = true,
        childFactory = ::child,
    )

    fun onBack() = nav.pop()

    private fun child(config: Config, ctx: ComponentContext): Child = when (config) {
        Config.Orders -> Child.Orders(OrdersComponent(ctx, graph, brigadeId, onOpen = { nav.pushNew(Config.Order(it)) }))
        is Config.Order -> Child.Order(
            OrderComponent(
                ctx, graph, config.id,
                onBack = nav::pop,
                onShoot = { o, stage -> nav.pushNew(Config.Camera(o.id, o.objectId, "${o.id} · ${o.objectId}", o.address ?: o.kind.title, stage)) },
            ),
        )
        is Config.Camera -> Child.Camera(
            CameraComponent(
                ctx, config.title, config.subtitle, config.stage, graph.clock,
                onFinished = { photos ->
                    // экран закрываем сразу: прикрепление идёт в фоне, «назад» во время него не снимет наряд
                    nav.popWhile { it is Config.Camera }
                    scope.launch { graph.attachPhotos(config.orderId, config.objectId, photos) }
                },
                onClosed = { nav.popWhile { it is Config.Camera } },
            ),
        )
    }
}
