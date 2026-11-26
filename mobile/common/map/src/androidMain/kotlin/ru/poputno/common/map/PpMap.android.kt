package ru.poputno.common.map

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.yandex.mapkit.Animation
import com.yandex.mapkit.MapKitFactory
import com.yandex.mapkit.geometry.BoundingBox
import com.yandex.mapkit.geometry.Geometry
import com.yandex.mapkit.geometry.Point
import com.yandex.mapkit.map.CameraPosition
import com.yandex.mapkit.map.MapObjectTapListener
import com.yandex.mapkit.map.PlacemarkMapObject
import com.yandex.mapkit.mapview.MapView
import com.yandex.runtime.image.ImageProvider
import ru.poputno.common.domain.model.GeoPoint
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpStatus
import ru.poputno.core.designsystem.components.colors

/**
 * Инициализация MapKit. Вызывается из Application.onCreate до первой карты.
 * Ключ приходит из сборки (local.properties → BuildConfig), в исходниках его нет.
 */
object PoputnoMaps {
    internal var ready = false
        private set

    fun init(context: Context, apiKey: String) {
        if (ready || apiKey.isBlank()) return
        MapKitFactory.setApiKey(apiKey)
        MapKitFactory.setLocale("ru_RU")
        MapKitFactory.initialize(context.applicationContext)
        ready = true
    }
}

actual val mapsSupported: Boolean = true

private val MOSCOW = Point(55.7512, 37.6184)

@Composable
actual fun PpMap(
    pins: List<MapPin>,
    modifier: Modifier,
    selectedId: String?,
    focus: GeoPoint?,
    onPinClick: (String) -> Unit,
) {
    if (!PoputnoMaps.ready) {
        SchematicMap(pins, modifier, selectedId, onPinClick)
        return
    }
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val c = Pp.colors
    val dark = c.isDark
    val onClick = rememberUpdatedState(onPinClick)
    val mapView = remember { MapView(context) }

    // MapKit держит слушатели по слабой ссылке: держим сами, иначе тапы перестанут работать
    val tapListener = remember {
        MapObjectTapListener { obj, _ -> (obj.userData as? String)?.let { onClick.value(it) }; true }
    }
    // иконки меток строятся один раз на набор статусов, не на каждую рекомпозицию
    val statusColors = PpStatus.entries.associateWith { it.colors().solid.toArgb() }
    val ring = c.surface.base.toArgb()
    val scan = c.accent.scan.toArgb()
    val icons = remember(statusColors, ring, scan) {
        statusColors.mapValues { (_, color) -> pinBitmap(color, ring, null) to pinBitmap(color, ring, scan) }
    }

    // жизненный цикл MapKit и MapView следует за экраном: карта не рендерит в фоне
    DisposableEffect(lifecycle, mapView) {
        val observer = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> { MapKitFactory.getInstance().onStart(); mapView.onStart() }
                Lifecycle.Event.ON_STOP -> { mapView.onStop(); MapKitFactory.getInstance().onStop() }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) { MapKitFactory.getInstance().onStart(); mapView.onStart() }
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onStop(); MapKitFactory.getInstance().onStop()
        }
    }

    LaunchedEffect(dark) { mapView.mapWindow.map.isNightModeEnabled = dark }

    // метки: пересобираются только при смене набора или выбора
    LaunchedEffect(pins, selectedId, icons) {
        val objects = mapView.mapWindow.map.mapObjects
        objects.clear()
        pins.forEach { p ->
            val (normal, selected) = icons.getValue(p.status)
            val pm: PlacemarkMapObject = objects.addPlacemark()
            pm.geometry = Point(p.point.lat, p.point.lon)
            pm.setIcon(ImageProvider.fromBitmap(if (p.id == selectedId) selected else normal))
            pm.userData = p.id
            pm.addTapListener(java.lang.ref.WeakReference(tapListener))
        }
    }

    // камера: на фокус или на охват всех меток
    LaunchedEffect(pins.map { it.point }, focus) {
        val map = mapView.mapWindow.map
        val target = focus?.let { Point(it.lat, it.lon) }
        val position = when {
            target != null -> CameraPosition(target, 15.5f, 0f, 0f)
            pins.size == 1 -> CameraPosition(Point(pins[0].point.lat, pins[0].point.lon), 15f, 0f, 0f)
            pins.isNotEmpty() -> {
                val box = BoundingBox(
                    Point(pins.minOf { it.point.lat }, pins.minOf { it.point.lon }),
                    Point(pins.maxOf { it.point.lat }, pins.maxOf { it.point.lon }),
                )
                map.cameraPosition(Geometry.fromBoundingBox(box)).let { CameraPosition(it.target, (it.zoom - 0.6f).coerceAtMost(16f), 0f, 0f) }
            }
            else -> CameraPosition(MOSCOW, 10f, 0f, 0f)
        }
        map.move(position, Animation(Animation.Type.SMOOTH, 0.4f), null)
    }

    AndroidView(factory = { mapView }, modifier = modifier.clip(Pp.radii.card))
}

/** Метка: точка цвета статуса в кольце фона, выбранная — с циановым ореолом (как фокус бренда). */
private fun pinBitmap(fill: Int, ring: Int, halo: Int?): Bitmap {
    val size = 72
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val cv = Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    val cx = size / 2f
    if (halo != null) {
        p.style = Paint.Style.STROKE; p.strokeWidth = 6f; p.color = halo
        cv.drawCircle(cx, cx, 32f, p)
        p.style = Paint.Style.FILL
    }
    p.color = ring; cv.drawCircle(cx, cx, 22f, p)
    p.color = fill; cv.drawCircle(cx, cx, 17f, p)
    return bmp
}

/** Маршрут: Яндекс Навигатор, если стоит; иначе Яндекс Карты; иначе браузер. */
actual fun openRoute(point: GeoPoint, label: String) {
    val ctx = appContext ?: return
    val candidates = listOf(
        Uri.parse("yandexnavi://build_route_on_map?lat_to=${point.lat}&lon_to=${point.lon}"),
        Uri.parse("yandexmaps://maps.yandex.ru/?rtext=~${point.lat},${point.lon}&rtt=auto"),
        Uri.parse(yandexRouteUrl(point)),
    )
    for (uri in candidates) {
        val intent = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (runCatching { ctx.startActivity(intent) }.isSuccess) return
    }
}

/** Контекст для внешних интентов; ставится в [PoputnoMaps.init]-соседе ниже. */
internal var appContext: Context? = null

/** Привязка контекста приложения (маршруты работают и без ключа MapKit). */
fun PoputnoMaps.attach(context: Context) { appContext = context.applicationContext }
