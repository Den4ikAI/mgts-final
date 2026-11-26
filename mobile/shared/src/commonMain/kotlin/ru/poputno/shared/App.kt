package ru.poputno.shared

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.disk.DiskCache
import coil3.memory.MemoryCache
import coil3.network.ktor3.KtorNetworkFetcherFactory
import com.arkivanov.decompose.extensions.compose.stack.Children
import com.arkivanov.decompose.extensions.compose.stack.animation.stackAnimation
import com.arkivanov.decompose.extensions.compose.subscribeAsState
import okio.FileSystem
import ru.poputno.common.domain.model.Role
import ru.poputno.common.ui.layout.NavItem
import ru.poputno.common.ui.layout.RoleScaffold
import ru.poputno.common.ui.layout.ScreenHeader
import ru.poputno.common.ui.motion.frameReveal
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.PpTheme
import ru.poputno.core.designsystem.PpThemeMode
import ru.poputno.core.designsystem.components.PpButton
import ru.poputno.core.designsystem.components.PpButtonVariant
import ru.poputno.core.designsystem.components.PpCard
import ru.poputno.core.designsystem.components.PpLogo
import ru.poputno.core.designsystem.components.PpSegmented
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.icons.PpIcons
import ru.poputno.feature.admin.presentation.AdminScreen
import ru.poputno.feature.auth.presentation.LoginScreen
import ru.poputno.feature.brigade.presentation.BrigadeContent
import ru.poputno.feature.brigade.presentation.BrigadeRootComponent
import ru.poputno.feature.dispatcher.presentation.DispatcherScreen
import ru.poputno.feature.manager.presentation.ManagerScreen
import ru.poputno.shared.root.HomeComponent
import ru.poputno.shared.root.HomeTab
import ru.poputno.shared.root.RoleChild
import ru.poputno.shared.root.RootComponent
import ru.poputno.shared.ui.Splash

/**
 * Корневой UI. Картинки грузятся тем же клиентом, что API: с Bearer и общей cookie-сессией,
 * пул соединений один.
 */
@Composable
fun App(root: RootComponent, showSplash: Boolean = true) {
    val http = root.http
    setSingletonImageLoaderFactory { ctx ->
        ImageLoader.Builder(ctx)
            .components { add(KtorNetworkFetcherFactory(httpClient = { http })) }
            // фото с камер по 1–2 МБ: держим декодированные миниатюры, а не исходники
            .memoryCache { MemoryCache.Builder().maxSizePercent(ctx, 0.20).build() }
            .diskCache {
                DiskCache.Builder()
                    .directory(FileSystem.SYSTEM_TEMPORARY_DIRECTORY / "poputno_images")
                    .maxSizeBytes(256L * 1024 * 1024)
                    .build()
            }
            .build()
    }
    val theme by root.theme.subscribeAsState()
    var splashDone by rememberSaveable { mutableStateOf(!showSplash) }
    PpTheme(mode = theme) {
        val m = Pp.motion
        Box(Modifier.fillMaxSize()) {
            Children(root.stack, Modifier.fillMaxSize(), animation = stackAnimation(frameReveal(m))) {
                when (val c = it.instance) {
                    is RootComponent.Child.Login -> LoginScreen(c.component)
                    is RootComponent.Child.Home -> Home(c.component)
                }
            }
            // приложение уже собрано под сплэшем: на выходе нет пустого кадра
            if (!splashDone) Splash { splashDone = true }
        }
    }
}

private fun Role.mainItem() = when (this) {
    Role.Dispatcher -> NavItem(HomeTab.Main.name, "Очередь", PpIcons.Queue)
    Role.Manager -> NavItem(HomeTab.Main.name, "Наряды", PpIcons.Board)
    Role.Brigade -> NavItem(HomeTab.Main.name, "Наряды", PpIcons.Route)
    Role.Admin -> NavItem(HomeTab.Main.name, "Пользователи", PpIcons.User)
}

@Composable
private fun Home(home: HomeComponent) {
    val tab by home.tab.subscribeAsState()
    val m = Pp.motion
    val items = remember(home.user.role) {
        listOf(home.user.role.mainItem(), NavItem(HomeTab.Profile.name, "Профиль", PpIcons.UserCheck))
    }
    // камера бригады перекрывает навигацию целиком
    val immersive = (home.roleChild as? RoleChild.Brigade)?.let { b ->
        val st by b.component.stack.subscribeAsState()
        st.active.instance is BrigadeRootComponent.Child.Camera
    } ?: false
    RoleScaffold(items, tab.name, { home.select(HomeTab.valueOf(it)) }, home.user.name, home.user.role.title, home.onLogout, immersive = immersive) {
        // смена вкладки — не сдвиг, а «перефокус»: новый экран проявляется с лёгким приближением
        AnimatedContent(
            tab, Modifier.fillMaxSize(),
            transitionSpec = { (fadeIn(tween(m.base, easing = m.easeOut)) + scaleIn(tween(m.base, easing = m.easeOut), initialScale = 0.985f)) togetherWith fadeOut(tween(m.exit)) },
        ) { t ->
            when (t) {
                HomeTab.Profile -> Profile(home)
                HomeTab.Main -> when (val r = home.roleChild) {
                    is RoleChild.Dispatcher -> DispatcherScreen(r.component)
                    is RoleChild.Manager -> ManagerScreen(r.component)
                    is RoleChild.Brigade -> BrigadeContent(r.component)
                    is RoleChild.Admin -> AdminScreen(r.component)
                }
            }
        }
    }
}

@Composable
private fun Profile(home: HomeComponent) {
    val theme by home.theme.subscribeAsState()
    val u = home.user
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Профиль", u.role.title)
        Column(Modifier.padding(horizontal = Pp.space.page).widthIn(max = 560.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PpCard(Modifier.fillMaxWidth()) {
                PpText(u.name, style = Pp.type.title)
                PpText(u.login, style = Pp.type.mono, color = Pp.colors.text.muted)
            }
            PpCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        PpText("Тема", style = Pp.type.label)
                        PpText("Светлая читается на солнце", style = Pp.type.caption, color = Pp.colors.text.muted)
                    }
                    PpSegmented(PpThemeMode.entries, theme, { if (it == PpThemeMode.Dark) "Тёмная" else "Светлая" }, home::setTheme)
                }
            }
            PpButton("Выйти", home.onLogout, Modifier.fillMaxWidth(), PpButtonVariant.Secondary)
            PpLogo(Modifier.padding(top = 24.dp), height = 22.dp)
        }
    }
}
