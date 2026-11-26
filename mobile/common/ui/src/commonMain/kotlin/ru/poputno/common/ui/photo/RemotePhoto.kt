package ru.poputno.common.ui.photo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.crossfade
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.icons.PpIcons

/**
 * Фото с сервера (`/api/media/...`, Bearer — через общий HttpClient в ImageLoader).
 * Рамки результатов ML сервер вшивает в саму картинку — клиент их не рисует, чтобы не задвоить.
 *
 * Производительность: Coil декодирует под фактический размер composable (миниатюра 64 dp, а не
 * исходные 1–2 МБ), кэш памяти и диска; запрос пересоздаётся только при смене url;
 * состояние загрузки меняется 1–2 раза за жизнь, не на каждый кадр.
 */
@Composable
fun RemotePhoto(
    url: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallbackIcon: ImageVector = PpIcons.Camera,
    iconSize: Dp = 24.dp,
) {
    val c = Pp.colors
    val ctx = LocalPlatformContext.current
    val crossfade = Pp.motion.base
    val request = remember(url, ctx) { url?.let { ImageRequest.Builder(ctx).data(it).crossfade(crossfade).build() } }
    var failed by remember(url) { mutableStateOf(url == null) }
    Box(modifier.background(c.surface.skeleton), contentAlignment = Alignment.Center) {
        if (request != null) {
            AsyncImage(
                model = request,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = contentScale,
                placeholder = ColorPainter(c.surface.skeleton),
                onSuccess = { failed = false },
                onError = { failed = true },
            )
        }
        if (failed) PpIcon(fallbackIcon, size = iconSize, tint = c.text.disabled)
    }
}

/** Кадр-доказательство целиком (Fit): видно весь кадр с рамками, нанесёнными сервером. */
@Composable
fun DetectionPhoto(url: String?, modifier: Modifier = Modifier) {
    RemotePhoto(
        url,
        modifier.background(Pp.colors.surface.sunken),
        contentScale = ContentScale.Fit,
        iconSize = 40.dp,
    )
}
