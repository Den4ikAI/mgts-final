package ru.poputno.common.camera.platform

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.util.concurrent.Executors
import kotlin.coroutines.resume

/**
 * CameraX. Производительность:
 *  - CAPTURE_MODE_MINIMIZE_LATENCY — затвор без задержки;
 *  - запись JPEG на отдельном executor, main-поток не блокируется;
 *  - PreviewView в режиме PERFORMANCE (SurfaceView), а не TextureView;
 *  - камера отвязывается при уходе с экрана (DisposableEffect), батарея не тратится;
 *  - кадры пишутся в filesDir/evidence: кэш система может очистить до выгрузки на сервер.
 */
private class AndroidCameraController(private val context: Context) : CameraController {
    val imageCapture: ImageCapture = ImageCapture.Builder()
        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
        .build()
    /** Привязана ли камера: затвор до привязки ждёт её (до 3 с), а не возвращает ошибку. */
    private val bound = kotlinx.coroutines.flow.MutableStateFlow(false)
    var camera: androidx.camera.core.Camera? = null
        set(value) {
            field = value
            bound.value = value != null
            value?.cameraControl?.enableTorch(torch) // фонарик переживает переподключение
        }
    private var torch = false
    private val io = Executors.newSingleThreadExecutor()

    override suspend fun capture(): String? {
        kotlinx.coroutines.withTimeoutOrNull(3_000) { bound.first { it } } ?: return null
        return takePicture()
    }

    private suspend fun takePicture(): String? = suspendCancellableCoroutine { cont ->
        val dir = File(context.filesDir, "evidence").apply { mkdirs() }
        val file = File(dir, "shot-${System.currentTimeMillis()}.jpg")
        imageCapture.takePicture(
            ImageCapture.OutputFileOptions.Builder(file).build(),
            io,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) { if (cont.isActive) cont.resume(file.absolutePath) }
                override fun onError(exception: ImageCaptureException) { if (cont.isActive) cont.resume(null) }
            },
        )
    }

    override fun setTorch(enabled: Boolean) {
        torch = enabled
        camera?.cameraControl?.enableTorch(enabled)
    }

    fun shutdown() = io.shutdown()
}

@Composable
actual fun rememberCameraController(): CameraController {
    val context = LocalContext.current
    val controller = remember { AndroidCameraController(context.applicationContext) }
    DisposableEffect(controller) { onDispose { controller.shutdown() } }
    return controller
}

@Composable
actual fun CameraPreview(controller: CameraController, modifier: Modifier) {
    val ctrl = controller as AndroidCameraController
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.PERFORMANCE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    DisposableEffect(lifecycleOwner) {
        val providerFuture = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        var disposed = false
        providerFuture.addListener({
            // экран могли закрыть раньше, чем провайдер готов: не привязывать камеру к Activity
            if (disposed) return@addListener
            val p = providerFuture.get().also { provider = it }
            val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
            p.unbindAll()
            ctrl.camera = p.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, ctrl.imageCapture)
        }, ContextCompat.getMainExecutor(context))
        onDispose { disposed = true; provider?.unbindAll(); ctrl.camera = null }
    }
    AndroidView(factory = { previewView }, modifier = modifier)
}
