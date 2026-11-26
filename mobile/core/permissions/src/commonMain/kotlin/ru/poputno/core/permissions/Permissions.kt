package ru.poputno.core.permissions

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

enum class Permission { Camera }

enum class PermissionStatus {
    /** Ещё не спрашивали (или диалог закрыли без ответа): можно запросить. */
    NotDetermined,
    Granted,
    /** Отказано, можно спросить снова. */
    Denied,
    /** Отказано окончательно или запрещено политикой: только через настройки системы. */
    DeniedForever,
}

/** Состояние разрешения внутри composition. [request] показывает системный диалог. */
@Stable
interface PermissionState {
    val permission: Permission
    val status: PermissionStatus
    fun request()
    /** Открыть системные настройки приложения (после DeniedForever). */
    fun openSettings()
    /** Перечитать статус у системы (вернулись из настроек). */
    fun refresh()
}

val PermissionState.isGranted get() = status == PermissionStatus.Granted

/**
 * Разрешение с автообновлением: при каждом возвращении на экран (ON_RESUME — в том числе
 * из системных настроек) статус перечитывается, и экран-объяснение сменяется камерой сам.
 */
@Composable
fun rememberPermissionState(permission: Permission): PermissionState {
    val state = rememberPlatformPermissionState(permission)
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { state.refresh() }
    return state
}

@Composable
internal expect fun rememberPlatformPermissionState(permission: Permission): PermissionState
