package ru.poputno.common.camera.platform

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.poputno.core.designsystem.Pp
import java.awt.FileDialog
import java.awt.Frame
import java.io.File

/**
 * Desktop: вместо камеры — выбор снимка с диска. Файл настоящий, поэтому дальше он проходит
 * тот же путь, что кадр с телефона: наряд → POST /api/frames → вердикт модели.
 */
private class DesktopCameraController : CameraController {
    override suspend fun capture(): String? = withContext(Dispatchers.Main) {
        val dialog = FileDialog(null as Frame?, "Снимок для наряда", FileDialog.LOAD).apply {
            setFilenameFilter { _, name -> name.lowercase().run { endsWith(".jpg") || endsWith(".jpeg") || endsWith(".png") || endsWith(".webp") } }
            isVisible = true // модальный: Swing-петля событий продолжает работать
        }
        val dir = dialog.directory ?: return@withContext null
        val name = dialog.file ?: return@withContext null
        File(dir, name).takeIf { it.isFile }?.absolutePath
    }

    override fun setTorch(enabled: Boolean) = Unit
}

@Composable
actual fun rememberCameraController(): CameraController = remember { DesktopCameraController() }

/** Видоискатель-заглушка: подсказывает, что снимок выбирается файлом. */
@Composable
actual fun CameraPreview(controller: CameraController, modifier: Modifier) {
    val c = Pp.colors
    Canvas(modifier) {
        drawRect(Brush.verticalGradient(listOf(c.surface.overlay, c.surface.sunken)))
        val r = size.minDimension * 0.16f
        drawCircle(c.text.disabled, radius = r, center = center, style = Stroke(r * 0.14f))
    }
}
