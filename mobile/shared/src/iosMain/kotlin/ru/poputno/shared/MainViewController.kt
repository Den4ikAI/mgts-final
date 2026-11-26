package ru.poputno.shared

import androidx.compose.ui.window.ComposeUIViewController
import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.lifecycle.ApplicationLifecycle
import platform.Foundation.NSDate
import platform.Foundation.timeIntervalSince1970
import platform.UIKit.UIViewController
import ru.poputno.shared.di.AppGraph
import ru.poputno.shared.root.RootComponent

/** Точка входа iOS: Xcode-проект вызывает `MainViewControllerKt.MainViewController()`. */
fun MainViewController(): UIViewController {
    val graph = AppGraph { (NSDate().timeIntervalSince1970 * 1000).toLong() }
    val root = RootComponent(DefaultComponentContext(ApplicationLifecycle()), graph)
    return ComposeUIViewController { App(root) }
}
