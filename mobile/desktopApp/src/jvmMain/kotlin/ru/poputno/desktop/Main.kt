package ru.poputno.desktop

import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.components.PpAppIconPainter
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.decompose.extensions.compose.lifecycle.LifecycleController
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import ru.poputno.shared.App
import ru.poputno.shared.di.AppGraph
import ru.poputno.shared.root.RootComponent
import javax.swing.SwingUtilities

fun main() {
    val lifecycle = LifecycleRegistry()
    val graph = AppGraph { System.currentTimeMillis() }
    // Decompose требует создавать компоненты на main (EDT) потоке
    val root = runOnUiThread { RootComponent(DefaultComponentContext(lifecycle), graph) }
    application {
        val state = rememberWindowState(width = 1280.dp, height = 820.dp)
        LifecycleController(lifecycle, state)
        val icon = remember { PpAppIconPainter() }
        Window(onCloseRequest = { graph.close(); exitApplication() }, state = state, title = "Попутно", icon = icon) {
            App(root)
        }
    }
}

private fun <T> runOnUiThread(block: () -> T): T {
    if (SwingUtilities.isEventDispatchThread()) return block()
    var result: T? = null
    SwingUtilities.invokeAndWait { result = block() }
    @Suppress("UNCHECKED_CAST")
    return result as T
}
