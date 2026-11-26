package ru.poputno.common.map

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import ru.poputno.common.domain.model.GeoPoint
import ru.poputno.core.designsystem.components.PpStatus

/** Метка на карте: объект или наряд. Цвет — статус (тёплые цвета только для состояния). */
@Immutable
data class MapPin(val id: String, val point: GeoPoint, val status: PpStatus, val title: String)

/**
 * Есть ли карта на платформе. Сейчас только Android (Яндекс MapKit); на iOS и desktop
 * блоки карт скрываются целиком — экраны не должны показывать пустое место.
 */
expect val mapsSupported: Boolean

/**
 * Карта объектов на Яндекс MapKit: ночной режим в тёмной теме, метки цвета статуса.
 * Если ключ MapKit не задан в сборке — схема без подложки по тем же координатам.
 *
 * [focus] — куда навести камеру; без него камера охватывает все метки.
 */
@Composable
expect fun PpMap(
    pins: List<MapPin>,
    modifier: Modifier = Modifier,
    selectedId: String? = null,
    focus: GeoPoint? = null,
    onPinClick: (String) -> Unit = {},
)

/** Маршрут до точки во внешнем приложении: Яндекс Навигатор → Яндекс Карты → браузер. */
expect fun openRoute(point: GeoPoint, label: String)

/** Ссылка маршрута Яндекс Карт (общая для браузера на всех платформах). */
fun yandexRouteUrl(p: GeoPoint) = "https://yandex.ru/maps/?rtext=~${p.lat},${p.lon}&rtt=auto"
