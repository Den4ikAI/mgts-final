@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package ru.poputno.common.camera.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.CValue
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.AVFoundation.AVCaptureDevice
import platform.AVFoundation.AVCaptureDeviceInput
import platform.AVFoundation.AVCaptureOutput
import platform.AVFoundation.AVCapturePhoto
import platform.AVFoundation.AVCapturePhotoCaptureDelegateProtocol
import platform.AVFoundation.AVCapturePhotoOutput
import platform.AVFoundation.AVCapturePhotoSettings
import platform.AVFoundation.AVCaptureSession
import platform.AVFoundation.AVCaptureSessionPresetPhoto
import platform.AVFoundation.AVCaptureTorchModeOff
import platform.AVFoundation.AVCaptureTorchModeOn
import platform.AVFoundation.AVCaptureVideoPreviewLayer
import platform.AVFoundation.AVLayerVideoGravityResizeAspectFill
import platform.AVFoundation.AVMediaTypeVideo
import platform.AVFoundation.fileDataRepresentation
import platform.AVFoundation.hasTorch
import platform.AVFoundation.torchMode
import platform.CoreGraphics.CGRect
import platform.Foundation.NSError
import platform.Foundation.NSDate
import platform.Foundation.timeIntervalSince1970
import platform.Foundation.writeToFile
import platform.QuartzCore.CATransaction
import platform.QuartzCore.kCATransactionDisableActions
import platform.UIKit.UIView
import platform.darwin.NSObject
import platform.darwin.dispatch_async
import platform.darwin.dispatch_queue_create
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSSearchPathForDirectoriesInDomains
import platform.Foundation.NSUserDomainMask
import kotlin.coroutines.resume

/** AVFoundation. Сессия стартует/останавливается вне main-потока (startRunning блокирующий). */
private class IosCameraController : CameraController {
    val session = AVCaptureSession().apply { sessionPreset = AVCaptureSessionPresetPhoto }
    private val output = AVCapturePhotoOutput()
    private val device = AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo)
    private var delegate: NSObject? = null

    init {
        device?.let { d ->
            AVCaptureDeviceInput.deviceInputWithDevice(d, null)?.let { input ->
                if (session.canAddInput(input)) session.addInput(input)
            }
        }
        if (session.canAddOutput(output)) session.addOutput(output)
    }

    /** Последовательная очередь: stop не обгонит start (глобальная очередь конкурентная). */
    private val queue = dispatch_queue_create("ru.poputno.camera.session", null)
    fun start() = dispatch_async(queue) { session.startRunning() }
    fun stop() = dispatch_async(queue) { session.stopRunning() }

    override suspend fun capture(): String? = suspendCancellableCoroutine { cont ->
        val d = object : NSObject(), AVCapturePhotoCaptureDelegateProtocol {
            override fun captureOutput(output: AVCapturePhotoOutput, didFinishProcessingPhoto: AVCapturePhoto, error: NSError?) {
                val data = didFinishProcessingPhoto.fileDataRepresentation()
                val path = evidenceDir() + "/shot-${(NSDate().timeIntervalSince1970 * 1000).toLong()}.jpg"
                val ok = error == null && data != null && data.writeToFile(path, true)
                if (cont.isActive) cont.resume(if (ok) path else null)
                delegate = null
            }
        }
        delegate = d
        output.capturePhotoWithSettings(AVCapturePhotoSettings.photoSettings(), d)
    }

    override fun setTorch(enabled: Boolean) {
        val d = device ?: return
        if (!d.hasTorch) return
        if (d.lockForConfiguration(null)) {
            d.torchMode = if (enabled) AVCaptureTorchModeOn else AVCaptureTorchModeOff
            d.unlockForConfiguration()
        }
    }
}

/** Documents/evidence: tmp система чистит, а кадры должны дожить до выгрузки. */
private fun evidenceDir(): String {
    val docs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, true).first() as String
    val dir = "$docs/evidence"
    NSFileManager.defaultManager.createDirectoryAtPath(dir, true, null, null)
    return dir
}

@Composable
actual fun rememberCameraController(): CameraController {
    val c = remember { IosCameraController() }
    DisposableEffect(c) { c.start(); onDispose { c.stop() } }
    return c
}

private class PreviewHost(session: AVCaptureSession) : UIView(frame = platform.CoreGraphics.CGRectMake(0.0, 0.0, 0.0, 0.0)) {
    val layerPreview = AVCaptureVideoPreviewLayer(session = session).apply { videoGravity = AVLayerVideoGravityResizeAspectFill }
    init { layer.addSublayer(layerPreview) }
    override fun layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setValue(true, kCATransactionDisableActions)
        layerPreview.frame = bounds
        CATransaction.commit()
    }
}

@Composable
actual fun CameraPreview(controller: CameraController, modifier: Modifier) {
    val c = controller as IosCameraController
    UIKitView(factory = { PreviewHost(c.session) }, modifier = modifier)
}

