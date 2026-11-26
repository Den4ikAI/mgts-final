package ru.poputno.core.permissions

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

private val Permission.manifest get() = when (this) { Permission.Camera -> Manifest.permission.CAMERA }

private tailrec fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}

/**
 * Android не различает «ещё не спрашивали» и «запретили навсегда» (rationale=false в обоих).
 * Различаем по истории: «навсегда» — только если ДО запроса система просила объяснение
 * (rationale=true, т.е. уже был отказ), а после отказа перестала. Закрытый мимо диалог
 * (rationale не менялся с false) остаётся NotDetermined — можно спросить ещё раз.
 */
private class AndroidPermissionState(
    override val permission: Permission,
    private val context: Context,
) : PermissionState {
    var launch: () -> Unit = {}
    private var rationaleBeforeRequest = false
    override var status by mutableStateOf(initial())

    private fun granted() = ContextCompat.checkSelfPermission(context, permission.manifest) == PackageManager.PERMISSION_GRANTED
    private fun rationale() = context.activity()?.let { ActivityCompat.shouldShowRequestPermissionRationale(it, permission.manifest) } ?: false
    private fun initial() = when {
        granted() -> PermissionStatus.Granted
        rationale() -> PermissionStatus.Denied
        else -> PermissionStatus.NotDetermined
    }

    fun onResult(isGranted: Boolean) {
        status = when {
            isGranted -> PermissionStatus.Granted
            rationale() -> PermissionStatus.Denied
            rationaleBeforeRequest -> PermissionStatus.DeniedForever
            else -> PermissionStatus.NotDetermined
        }
    }

    override fun request() {
        rationaleBeforeRequest = rationale()
        launch()
    }

    override fun refresh() {
        if (granted()) status = PermissionStatus.Granted
        else if (status == PermissionStatus.Granted) status = PermissionStatus.Denied // отозвали в настройках
    }

    override fun openSettings() {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

@Composable
internal actual fun rememberPlatformPermissionState(permission: Permission): PermissionState {
    val context = LocalContext.current
    val state = remember(permission, context) { AndroidPermissionState(permission, context) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), state::onResult)
    state.launch = { launcher.launch(permission.manifest) }
    return state
}
