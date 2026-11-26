package ru.poputno.android

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.arkivanov.decompose.defaultComponentContext
import com.arkivanov.decompose.value.subscribe
import com.arkivanov.essenty.lifecycle.essentyLifecycle
import ru.poputno.common.map.PoputnoMaps
import ru.poputno.common.map.attach
import ru.poputno.core.designsystem.PpThemeMode
import ru.poputno.shared.App
import ru.poputno.shared.di.AppGraph
import ru.poputno.shared.root.RootComponent

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        applyBars(PpThemeMode.Dark)
        super.onCreate(savedInstanceState)
        val graph = (application as PoputnoApp).graph
        val root = RootComponent(defaultComponentContext(), graph)
        // иконки статус-бара следуют теме приложения: светлая тема бригады — тёмные иконки
        root.theme.subscribe(essentyLifecycle()) { applyBars(it) }
        setContent { App(root) }
    }

    private fun applyBars(mode: PpThemeMode) {
        val style = if (mode == PpThemeMode.Dark) SystemBarStyle.dark(Color.TRANSPARENT)
        else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(style, style)
    }
}

class PoputnoApp : android.app.Application() {
    val graph by lazy { AppGraph { System.currentTimeMillis() } }

    override fun onCreate() {
        super.onCreate()
        PoputnoMaps.attach(this)
        PoputnoMaps.init(this, BuildConfig.YANDEX_MAPKIT_KEY)
    }
}
