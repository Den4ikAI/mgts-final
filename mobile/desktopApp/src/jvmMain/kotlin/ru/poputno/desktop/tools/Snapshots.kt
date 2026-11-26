package ru.poputno.desktop.tools

import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.unit.Density
import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.arkivanov.essenty.lifecycle.resume
import org.jetbrains.skia.EncodedImageFormat
import ru.poputno.common.domain.model.Role
import ru.poputno.feature.auth.presentation.LoginIntent
import ru.poputno.shared.App
import ru.poputno.shared.di.AppGraph
import ru.poputno.shared.root.RootComponent
import ru.poputno.shared.root.RoleChild
import ru.poputno.feature.brigade.presentation.BrigadeRootComponent
import java.io.File
import javax.swing.SwingUtilities

/**
 * Headless-скриншоты для проверки адаптивной раскладки без дисплея:
 * ./gradlew :desktopApp:snapshots -Pout=<dir>
 */
fun main(args: Array<String>) {
    val out = File(args.firstOrNull() ?: "build/snapshots").apply { mkdirs() }
    val sizes = listOf("phone" to (390 to 844), "desktop" to (1280 to 800), "wide" to (1920 to 1080))
    val scenarios: List<Pair<String, Role?>> = listOf("login" to null) + Role.entries.map { it.name.lowercase() to it } +
        listOf("order" to Role.Brigade, "camera" to Role.Brigade, "detail" to Role.Dispatcher)
    splashFrames(out)
    for ((name, role) in scenarios) for ((sz, wh) in sizes) {
        val (w, h) = wh
        lateinit var root: RootComponent
        lateinit var scene: ImageComposeScene
        val lifecycle = LifecycleRegistry()
        ui {
            root = RootComponent(DefaultComponentContext(lifecycle), AppGraph { 1_795_000_000_000L })
            lifecycle.resume()
            scene = ImageComposeScene(w * 2, h * 2, Density(2f)) { App(root, showSplash = name == "splash") }
        }
        repeat(8) { ui { scene.render(it * 120_000_000L) }; Thread.sleep(60) }
        if (role != null) {
            ui {
                val login = root.stack.value.active.instance as RootComponent.Child.Login
                login.component.accept(LoginIntent.Demo(role))
            }
            // вход — настоящий запрос к серверу; очередь и фото тоже из сети
            repeat(40) { ui { scene.render(500_000_000L + it * 100_000_000L) }; Thread.sleep(100) }
            if (name == "detail") ui {
                val home = (root.stack.value.active.instance as RootComponent.Child.Home).component
                val d = (home.roleChild as RoleChild.Dispatcher).component
                d.state.value.items?.firstOrNull { it.photoUrl?.contains("/store/") == true }?.let {
                    d.accept(ru.poputno.feature.dispatcher.presentation.DispatcherIntent.Select(it.id))
                }
            }
            if (name == "order" || name == "camera") ui {
                val home = (root.stack.value.active.instance as RootComponent.Child.Home).component
                val brigade = (home.roleChild as RoleChild.Brigade).component
                (brigade.stack.value.active.instance as BrigadeRootComponent.Child.Orders).component.onOpen("WO-0309")
            }
            Thread.sleep(100)
            if (name == "camera") {
                repeat(5) { ui { scene.render(700_000_000L + it * 100_000_000L) }; Thread.sleep(40) }
                ui {
                    val home = (root.stack.value.active.instance as RootComponent.Child.Home).component
                    val brigade = (home.roleChild as RoleChild.Brigade).component
                    val order = (brigade.stack.value.active.instance as BrigadeRootComponent.Child.Order).component
                    order.onShoot(order.state.value.order!!, ru.poputno.common.domain.model.PhotoStage.After)
                }
            }
            repeat(30) { ui { scene.render(5_000_000_000L + it * 100_000_000L) }; Thread.sleep(80) }
        }
        ui {
            val img = scene.render(20_000_000_000L)
            File(out, "$name-$sz.png").writeBytes(img.encodeToData(EncodedImageFormat.PNG)!!.bytes)
            scene.close()
        }
        println("ok $name-$sz")
    }
    System.exit(0)
}

private fun ui(block: () -> Unit) = SwingUtilities.invokeAndWait(block)

/** Сплэш: кадры анимации по времени (телефон). */
private fun splashFrames(out: File) {
    lateinit var scene: ImageComposeScene
    ui {
        val root = RootComponent(DefaultComponentContext(LifecycleRegistry().apply { resume() }), AppGraph { 0L })
        scene = ImageComposeScene(390 * 2, 844 * 2, Density(2f)) { App(root, showSplash = true) }
    }
    var t = 0L
    for (ms in listOf(0, 300, 620, 800, 1000, 1300, 1700, 2100, 2500)) {
        // время сцены двигаем шагами по 16 мс, как настоящие кадры
        while (t < ms * 1_000_000L) { ui { scene.render(t) }; t += 16_000_000L }
        ui { File(out, "splash-%04d.png".format(ms)).writeBytes(scene.render(t).encodeToData(EncodedImageFormat.PNG)!!.bytes) }
    }
    ui { scene.close() }
    println("ok splash")
}
