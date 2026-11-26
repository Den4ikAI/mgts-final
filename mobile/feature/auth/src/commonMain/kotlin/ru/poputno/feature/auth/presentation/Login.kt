package ru.poputno.feature.auth.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Session
import ru.poputno.common.ui.motion.appear
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpButton
import ru.poputno.core.designsystem.components.PpButtonSize
import ru.poputno.core.designsystem.components.PpButtonVariant
import ru.poputno.core.designsystem.components.PpMark
import ru.poputno.core.designsystem.components.PpTextField
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.mvi.MviStore
import ru.poputno.core.mvi.retainedStore
import ru.poputno.feature.auth.domain.LoginUseCase

@Immutable
data class LoginState(
    val server: String = "",
    val login: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val serverError: String? = null,
    val loginError: String? = null,
    val passwordError: String? = null,
)

sealed interface LoginIntent {
    data class Server(val value: String) : LoginIntent
    data class Login(val value: String) : LoginIntent
    data class Password(val value: String) : LoginIntent
    data object Submit : LoginIntent
    data class Demo(val role: Role) : LoginIntent
}

sealed interface LoginLabel { data class LoggedIn(val session: Session) : LoginLabel }

internal class LoginStore(private val useCase: LoginUseCase, initialLogin: String) :
    MviStore<LoginIntent, LoginState, LoginLabel>(LoginState(server = useCase.serverUrl.value, login = initialLogin)) {

    override fun handle(intent: LoginIntent) {
        when (intent) {
            is LoginIntent.Server -> reduce { copy(server = intent.value, serverError = null) }
            is LoginIntent.Login -> reduce { copy(login = intent.value, loginError = null) }
            is LoginIntent.Password -> reduce { copy(password = intent.value, passwordError = null) }
            LoginIntent.Submit -> submit()
            is LoginIntent.Demo -> {
                val (l, p) = useCase.demoCredentials(intent.role)
                reduce { copy(login = l, password = p, loginError = null, passwordError = null) }
                submit()
            }
        }
    }

    private fun submit() {
        if (current.loading) return
        // снимок полей до suspend: ввод во время запроса не меняет отправленные данные
        val s = current
        reduce { copy(loading = true) }
        launch {
            when (val r = useCase(s.server, s.login, s.password)) {
                is Outcome.Ok -> { reduce { copy(loading = false) }; publish(LoginLabel.LoggedIn(r.value)) }
                is Outcome.Fail -> reduce {
                    when (val e = r.error) {
                        is AppError.Validation -> when (e.field) {
                            "server" -> copy(loading = false, serverError = e.message)
                            "password" -> copy(loading = false, passwordError = e.message)
                            else -> copy(loading = false, loginError = e.message)
                        }
                        AppError.Network -> copy(loading = false, serverError = "Сервер недоступен")
                        else -> copy(loading = false, loginError = "Не удалось войти")
                    }
                }
            }
        }
    }
}

class LoginComponent(
    context: ComponentContext,
    loginUseCase: LoginUseCase,
    initialLogin: String,
    private val onLoggedIn: (Session) -> Unit,
) : ComponentContext by context {
    private val store = retainedStore { LoginStore(loginUseCase, initialLogin) }
    val state: StateFlow<LoginState> = store.state
    fun accept(i: LoginIntent) = store.accept(i)

    init {
        coroutineScope().launch { store.labels.collect { if (it is LoginLabel.LoggedIn) onLoggedIn(it.session) } }
    }
}

/**
 * Вход. На широком окне — две колонки: слева бренд-полотно со знаком и обещанием,
 * справа форма. На телефоне — знак сверху, форма снизу, роли демо-входа чипами.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LoginScreen(component: LoginComponent) {
    val s by component.state.collectAsState()
    val a = Pp.adaptive
    val c = Pp.colors
    Row(Modifier.fillMaxSize().background(c.surface.base).windowInsetsPadding(WindowInsets.safeDrawing)) {
        if (a.atLeastExpanded) {
            Column(
                Modifier.weight(1f).fillMaxHeight().background(c.surface.sunken).padding(Pp.space.section),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                PpMark(size = 56.dp)
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    PpText("Машины уже едут.", style = Pp.type.h1)
                    PpText("Инфраструктуру проверяем попутно.", style = Pp.type.h1, color = c.accent.strong)
                }
                PpText("Мониторинг инфраструктуры МГТС с камер служебных машин", style = Pp.type.bodySm, color = c.text.muted)
            }
        }
        Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
            Column(
                Modifier.widthIn(max = 420.dp).fillMaxWidth().padding(Pp.space.page),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (!a.atLeastExpanded) { PpMark(size = 48.dp, modifier = Modifier.appear(0)); Spacer(Modifier.height(8.dp)) }
                PpText("Вход", style = Pp.type.h2, modifier = Modifier.appear(1))
                PpText("Логин и пароль выдаёт администратор", style = Pp.type.bodySm, color = c.text.muted, modifier = Modifier.appear(2))
                PpTextField(s.server, { component.accept(LoginIntent.Server(it)) }, "Сервер", Modifier.appear(3), placeholder = "http://192.168.0.10:8080", error = s.serverError, mono = true)
                PpTextField(s.login, { component.accept(LoginIntent.Login(it)) }, "Логин", Modifier.appear(3), placeholder = "dispatcher", error = s.loginError, mono = true)
                PpTextField(s.password, { component.accept(LoginIntent.Password(it)) }, "Пароль", Modifier.appear(4), error = s.passwordError, password = true)
                PpButton(
                    if (s.loading) "Входим…" else "Войти", { component.accept(LoginIntent.Submit) },
                    Modifier.fillMaxWidth().appear(5), size = PpButtonSize.Lg, enabled = !s.loading,
                )
                Spacer(Modifier.height(8.dp))
                PpText("ДЕМО-ВХОД ПО РОЛИ", style = Pp.type.micro, color = c.text.muted, modifier = Modifier.appear(6))
                FlowRow(Modifier.appear(7), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Role.entries.forEach { r ->
                        PpButton(r.title, { component.accept(LoginIntent.Demo(r)) }, variant = PpButtonVariant.Secondary, size = PpButtonSize.Sm, shape = Pp.radii.pill)
                    }
                }
            }
        }
    }
}
