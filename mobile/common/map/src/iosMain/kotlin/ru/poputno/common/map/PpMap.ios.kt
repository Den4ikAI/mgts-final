package ru.poputno.common.map

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import ru.poputno.common.domain.model.GeoPoint

/** Карт на этой платформе пока нет (решение команды): UI проверяет [mapsSupported] и скрывает блок. */
actual val mapsSupported: Boolean = false

@Composable
actual fun PpMap(
    pins: List<MapPin>,
    modifier: Modifier,
    selectedId: String?,
    focus: GeoPoint?,
    onPinClick: (String) -> Unit,
) = Unit

actual fun openRoute(point: GeoPoint, label: String) = Unit
