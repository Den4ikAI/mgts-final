package ru.poputno.common.camera.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.ui.Modifier

/**
 * Платформенная камера. Общий код знает только этот контракт:
 *  Android — CameraX (Preview + ImageCapture, минимизация задержки затвора),
 *  iOS     — AVFoundation (AVCaptureSession + AVCapturePhotoOutput),
 *  desktop — симуляция видоискателя (desktop у диспетчера/руководителя, бригада там не снимает).
 */
@Stable
interface CameraController {
    /** Снимок в локальный файл; null — не удалось. Выполняется вне main-потока. */
    suspend fun capture(): String?
    fun setTorch(enabled: Boolean)
}

@Composable
expect fun rememberCameraController(): CameraController

/** Превью живого кадра. Рисуется под оверлеем; сам оверлей общий (CameraScreen). */
@Composable
expect fun CameraPreview(controller: CameraController, modifier: Modifier = Modifier)
