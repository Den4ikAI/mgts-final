package ru.poputno.core.permissions

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

/** На desktop нет рантайм-разрешений: камера диспетчера/руководителя заменена импортом файлов. */
private class DesktopPermissionState(override val permission: Permission) : PermissionState {
    override val status = PermissionStatus.Granted
    override fun request() = Unit
    override fun openSettings() = Unit
    override fun refresh() = Unit
}

@Composable
internal actual fun rememberPlatformPermissionState(permission: Permission): PermissionState =
    remember(permission) { DesktopPermissionState(permission) }
