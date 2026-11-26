package ru.poputno.feature.admin.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ComponentContext
import kotlinx.coroutines.flow.StateFlow
import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.User
import ru.poputno.common.ui.layout.ScreenHeader
import ru.poputno.common.ui.motion.appear
import ru.poputno.common.ui.motion.rememberAppearRegistry
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpBadge
import ru.poputno.core.designsystem.components.PpButton
import ru.poputno.core.designsystem.components.PpButtonSize
import ru.poputno.core.designsystem.components.PpButtonVariant
import ru.poputno.core.designsystem.components.PpCard
import ru.poputno.core.designsystem.components.PpEmpty
import ru.poputno.core.designsystem.components.PpLoader
import ru.poputno.core.designsystem.components.PpSectionHeader
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.mvi.MviStore
import ru.poputno.core.mvi.retainedStore
import ru.poputno.feature.admin.di.AdminGraph

@Immutable
data class AdminState(
    val users: List<User>? = null,
    val busyIds: Set<String> = emptySet(),
    val message: String? = null,
)

sealed interface AdminIntent {
    data class ChangeRole(val userId: String, val role: Role) : AdminIntent
    data object Reload : AdminIntent
}

internal class AdminStore(private val g: AdminGraph) : MviStore<AdminIntent, AdminState, Nothing>(AdminState()) {
    init { launch { reload() } }

    override fun handle(intent: AdminIntent) {
        when (intent) {
            AdminIntent.Reload -> launch { reload() }
            is AdminIntent.ChangeRole -> {
                if (intent.userId in current.busyIds) return
                val users = current.users ?: return
                reduce { copy(busyIds = busyIds + intent.userId, message = null) }
                launch {
                    val r = g.changeRole(users, intent.userId, intent.role)
                    reduce {
                        when (r) {
                            is Outcome.Ok -> copy(users = this.users?.map { if (it.id == r.value.id) r.value else it }, busyIds = busyIds - intent.userId)
                            is Outcome.Fail -> copy(busyIds = busyIds - intent.userId, message = r.error.text())
                        }
                    }
                }
            }
        }
    }

    private suspend fun reload() {
        when (val r = g.loadUsers()) {
            is Outcome.Ok -> reduce { copy(users = r.value, message = null) }
            is Outcome.Fail -> reduce { copy(users = users ?: emptyList(), message = r.error.text()) }
        }
    }

    private fun AppError.text() = when (this) {
        is AppError.Validation -> message
        AppError.Network -> "Нет связи с сервером"
        AppError.Unauthorized -> "Сессия истекла"
        is AppError.Unknown -> "Ошибка сервера: $message"
    }
}

class AdminComponent(context: ComponentContext, graph: AdminGraph) : ComponentContext by context {
    private val store = retainedStore { AdminStore(graph) }
    val state: StateFlow<AdminState> = store.state
    fun accept(i: AdminIntent) = store.accept(i)
}

/** Короткие подписи ролей для чипов: на телефоне 4 полных слова не помещаются в строку. */
private val Role.chip get() = when (this) {
    Role.Admin -> "Админ"; Role.Dispatcher -> "Диспетчер"; Role.Manager -> "Руководитель"; Role.Brigade -> "Бригада"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AdminScreen(component: AdminComponent) {
    val s by component.state.collectAsState()
    val c = Pp.colors
    val users = s.users
    val registry = rememberAppearRegistry()
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Pp.space.page, end = Pp.space.page, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(contentType = "head") { ScreenHeader("Пользователи", "Роли и доступ · изменения сразу на сервере", inset = false) }
        s.message?.let { item(contentType = "msg") { PpText(it, style = Pp.type.caption, color = c.text.danger) } }
        when {
            users == null -> item { Box(Modifier.fillMaxSize().padding(48.dp), contentAlignment = Alignment.Center) { PpLoader() } }
            users.isEmpty() -> item { PpEmpty("Пользователей нет", "Или нет связи с сервером") }
            else -> {
                item(contentType = "header") { PpSectionHeader("Всего · ${users.size}") }
                itemsIndexed(users, key = { _, u -> u.id }, contentType = { _, _ -> "user" }) { i, u ->
                    UserCard(u, busy = u.id in s.busyIds, Modifier.animateItem().appear(i, u.id, registry)) { role ->
                        component.accept(AdminIntent.ChangeRole(u.id, role))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UserCard(u: User, busy: Boolean, modifier: Modifier, onRole: (Role) -> Unit) {
    val c = Pp.colors
    PpCard(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                PpText(u.name, style = Pp.type.label)
                PpText(u.login, style = Pp.type.monoSm, color = c.text.muted)
            }
            if (!u.active) PpBadge("отключён")
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Role.entries.forEach { r ->
                val on = r == u.role
                PpButton(
                    r.chip, { if (!on) onRole(r) },
                    variant = if (on) PpButtonVariant.Primary else PpButtonVariant.Ghost,
                    size = PpButtonSize.Sm, enabled = !busy || on, shape = Pp.radii.pill,
                )
            }
        }
    }
}
