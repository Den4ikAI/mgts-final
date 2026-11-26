package ru.poputno.core.permissions

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import platform.AVFoundation.AVAuthorizationStatusAuthorized
import platform.AVFoundation.AVAuthorizationStatusDenied
import platform.AVFoundation.AVAuthorizationStatusNotDetermined
import platform.AVFoundation.AVCaptureDevice
import platform.AVFoundation.AVMediaTypeVideo
import platform.AVFoundation.authorizationStatusForMediaType
import platform.AVFoundation.requestAccessForMediaType
import platform.Foundation.NSURL
import platform.UIKit.UIApplication
import platform.UIKit.UIApplicationOpenSettingsURLString
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_main_queue

private fun cameraStatus(): PermissionStatus = when (AVCaptureDevice.authorizationStatusForMediaType(AVMediaTypeVideo)) {
    AVAuthorizationStatusAuthorized -> PermissionStatus.Granted
    AVAuthorizationStatusNotDetermined -> PermissionStatus.NotDetermined
    AVAuthorizationStatusDenied -> PermissionStatus.DeniedForever
    else -> PermissionStatus.DeniedForever // Restricted: родительский контроль / MDM
}

private class IosPermissionState(override val permission: Permission) : PermissionState {
    override var status by mutableStateOf(cameraStatus())
    override fun request() {
        AVCaptureDevice.requestAccessForMediaType(AVMediaTypeVideo) { _ ->
            dispatch_async(dispatch_get_main_queue()) { status = cameraStatus() }
        }
    }
    override fun refresh() { status = cameraStatus() }
    override fun openSettings() {
        NSURL.URLWithString(UIApplicationOpenSettingsURLString)?.let {
            UIApplication.sharedApplication.openURL(it, emptyMap<Any?, Any>(), null)
        }
    }
}

@Composable
internal actual fun rememberPlatformPermissionState(permission: Permission): PermissionState =
    remember(permission) { IosPermissionState(permission) }
