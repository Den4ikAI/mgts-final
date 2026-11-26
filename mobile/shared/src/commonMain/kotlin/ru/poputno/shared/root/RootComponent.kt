package ru.poputno.shared.root

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.childContext
import com.arkivanov.decompose.router.stack.ChildStack
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.childStack
import com.arkivanov.decompose.router.stack.replaceAll
import com.arkivanov.decompose.value.MutableValue
import com.arkivanov.decompose.value.Value
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Session
import ru.poputno.common.domain.model.User
import ru.poputno.core.designsystem.PpThemeMode
import ru.poputno.feature.admin.presentation.AdminComponent
import ru.poputno.feature.auth.presentation.LoginComponent
import ru.poputno.feature.brigade.presentation.BrigadeRootComponent
import ru.poputno.feature.dispatcher.presentation.DispatcherComponent
import ru.poputno.feature.manager.presentation.ManagerComponent
import ru.poputno.shared.di.AppGraph
import ru.poputno.shared.di.SessionGraph

/**
 * Корень. Источник правды о сессии — AuthRepository.session, а не стек: стек восстанавливается
 * из saved state, а сессия (токен в памяти) — нет. Поэтому:
 *  - Home без живой сессии сразу заменяется входом (после пересоздания процесса/Activity);
 *  - истёкшая сессия (refresh отклонён) уводит на вход сама;
 *  - на каждый вход граф сессии новый, прежний закрывается.
 */
class RootComponent(context: ComponentContext, private val app: AppGraph) : ComponentContext by context {

    @Serializable
    sealed interface Config {
        @Serializable data object Login : Config
        @Serializable data class Home(val role: Role, val userId: String) : Config
    }

    sealed interface Child {
        class Login(val component: LoginComponent) : Child
        class Home(val component: HomeComponent) : Child
    }

    private val nav = StackNavigation<Config>()
    private val scope = coroutineScope()
    private var session: SessionGraph? = null

    /** HTTP-клиент API для загрузчика картинок (Bearer + cookie-сессия). Только внутри shared. */
    internal val http get() = app.data.api.http

    val theme = MutableValue(PpThemeMode.Dark)
    fun setTheme(mode: PpThemeMode) { theme.value = mode }

    val stack: Value<ChildStack<Config, Child>> = childStack(
        source = nav,
        serializer = Config.serializer(),
        initialConfiguration = Config.Login,
        childFactory = ::child,
    )

    init {
        // сессия пропала не по нашей кнопке (refresh отклонён) — на вход
        scope.launch {
            app.authRepository.session.drop(1).collect { s -> if (s == null && session != null) endSession(callServer = false) }
        }
    }

    private fun child(config: Config, ctx: ComponentContext): Child = when (config) {
        Config.Login -> Child.Login(LoginComponent(ctx, app.auth.loginUseCase, app.auth.lastLoginValue, ::onLoggedIn))
        is Config.Home -> {
            val g = session?.takeIf { it.session.user.id == config.userId }
            if (g == null) {
                // восстановленный стек без сессии: показать вход и выровнять навигацию
                // не Main.immediate: навигация изнутри childFactory запрещена, откладываем на следующий цикл
                scope.launch(Dispatchers.Main) { nav.replaceAll(Config.Login) }
                Child.Login(LoginComponent(ctx, app.auth.loginUseCase, app.auth.lastLoginValue, ::onLoggedIn))
            } else {
                Child.Home(HomeComponent(ctx, g, ::roleChild, onLogout = { endSession(callServer = true) }, onTheme = ::setTheme, theme = theme))
            }
        }
    }

    private fun onLoggedIn(s: Session) {
        session?.close()
        session = app.openSession(s)
        // светлая тема по умолчанию для бригады: улица, день, телефон
        theme.value = if (s.user.role == Role.Brigade) PpThemeMode.Light else PpThemeMode.Dark
        nav.replaceAll(Config.Home(s.user.role, s.user.id))
    }

    private fun roleChild(g: SessionGraph, ctx: ComponentContext): RoleChild = when (g.session.user.role) {
        Role.Dispatcher -> RoleChild.Dispatcher(DispatcherComponent(ctx, g.dispatcher))
        Role.Manager -> RoleChild.Manager(ManagerComponent(ctx, g.manager))
        Role.Brigade -> RoleChild.Brigade(BrigadeRootComponent(ctx, g.brigade, g.brigadeId))
        Role.Admin -> RoleChild.Admin(AdminComponent(ctx, g.admin))
    }

    /**
     * Выход. Порядок: снять сессию с корня (новый вход уже не пересечётся с этой) → сервер →
     * клинеры → закрыть граф. Закрытие в finally и NonCancellable: граф закроется, даже если
     * корутину отменят.
     */
    private fun endSession(callServer: Boolean) {
        val g = session ?: return
        session = null
        nav.replaceAll(Config.Login)
        scope.launch {
            withContext(NonCancellable) {
                try {
                    if (callServer) app.authRepository.logout()
                    for (cleaner in g.contributions().logoutCleaners) {
                        try { cleaner.clear() } catch (e: Exception) { /* следующий клинер всё равно выполнится */ }
                    }
                } finally {
                    g.close()
                }
            }
        }
    }
}

sealed interface RoleChild {
    class Dispatcher(val component: DispatcherComponent) : RoleChild
    class Manager(val component: ManagerComponent) : RoleChild
    class Brigade(val component: BrigadeRootComponent) : RoleChild
    class Admin(val component: AdminComponent) : RoleChild
}

enum class HomeTab { Main, Profile }

/**
 * Дом роли: основная фича + профиль. UI видит пользователя и действия, но не DI-граф.
 * Компонент фичи создаётся один раз и живёт, пока открыт дом.
 */
class HomeComponent(
    context: ComponentContext,
    graph: SessionGraph,
    factory: (SessionGraph, ComponentContext) -> RoleChild,
    val onLogout: () -> Unit,
    private val onTheme: (PpThemeMode) -> Unit,
    val theme: Value<PpThemeMode>,
) : ComponentContext by context {
    val user: User = graph.session.user
    val roleChild: RoleChild = factory(graph, childContext("role"))
    val tab = MutableValue(HomeTab.Main)
    fun select(t: HomeTab) { tab.value = t }
    fun setTheme(mode: PpThemeMode) = onTheme(mode)
}
