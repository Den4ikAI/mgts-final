// Сгенерировано tools/gen_icons.py из design2/brand/icons. Не править руками.
package ru.poputno.core.designsystem.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

private fun icon(name: String, vararg paths: String): ImageVector = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
    paths.forEach { d ->
        addPath(pathData = addPathNodes(d), stroke = SolidColor(Color.Black), strokeLineWidth = 1.75f,
            strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
    }
}.build()

/** Иконки бренда «Попутно». Монохром, красятся через tint. */
object PpIcons {
    val Alert: ImageVector by lazy { icon("alert", "M10.3 4.3L2.8 17.5a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z", "M12 9.5v4.5M12 17.1h.01") }
    val ArrowRight: ImageVector by lazy { icon("arrow-right", "M5 12h14M13 6l6 6-6 6") }
    val Board: ImageVector by lazy { icon("board", "M7.0 4.0h10.0a1.0 1.0 0 0 1 1.0 1.0v13.0a1.0 1.0 0 0 1 -1.0 1.0h-10.0a1.0 1.0 0 0 1 -1.0 -1.0v-13.0a1.0 1.0 0 0 1 1.0 -1.0Z", "M12.9 7.5l-2.6 4h3.4l-2.6 4M9 21h6") }
    val Cabinet: ImageVector by lazy { icon("cabinet", "M6.0 3.0h12.0a1.0 1.0 0 0 1 1.0 1.0v16.0a1.0 1.0 0 0 1 -1.0 1.0h-12.0a1.0 1.0 0 0 1 -1.0 -1.0v-16.0a1.0 1.0 0 0 1 1.0 -1.0Z", "M5 7.5h14M12 7.5V21M8 11h2M8 13.5h2M8 16h2") }
    val Camera: ImageVector by lazy { icon("camera", "M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z", "M8.5 13.0a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0Z") }
    val Car: ImageVector by lazy { icon("car", "M5 17H3.8a.8.8 0 0 1-.8-.8V13l1.9-4.1A1.5 1.5 0 0 1 6.3 8h8.4a1.5 1.5 0 0 1 1.2.6l3 3.9h1.3a.8.8 0 0 1 .8.8v2.9a.8.8 0 0 1-.8.8H19M9 17h6M3.4 12.5h16", "M5.0 17.0a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0Z", "M15.0 17.0a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0Z") }
    val Chart: ImageVector by lazy { icon("chart", "M4 20h16M7 16v-4M12 16V7M17 16v-6") }
    val Check: ImageVector by lazy { icon("check", "M5 12.5l4.5 4.5L19 7.5") }
    val ChevronDown: ImageVector by lazy { icon("chevron-down", "M6 9l6 6 6-6") }
    val Clock: ImageVector by lazy { icon("clock", "M3.0 12.0a9.0 9.0 0 1 0 18.0 0a9.0 9.0 0 1 0 -18.0 0Z", "M12 7v5l3 2") }
    val Close: ImageVector by lazy { icon("close", "M6 6l12 12M18 6L6 18") }
    val Corrosion: ImageVector by lazy { icon("corrosion", "M5.5 4.0h13.0a1.5 1.5 0 0 1 1.5 1.5v13.0a1.5 1.5 0 0 1 -1.5 1.5h-13.0a1.5 1.5 0 0 1 -1.5 -1.5v-13.0a1.5 1.5 0 0 1 1.5 -1.5Z", "M7.5 9.5a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0Z", "M13.0 14.5a2.5 2.5 0 1 0 5.0 0a2.5 2.5 0 1 0 -5.0 0Z", "M15 7.5h.01M8.5 16h.01") }
    val Dent: ImageVector by lazy { icon("dent", "M5 4h14v6.5l-4 1.5 4 1.5V20H5z", "M9 4v16") }
    val Eye: ImageVector by lazy { icon("eye", "M2.5 12C3.5 9.5 7 5 12 5s8.5 4.5 9.5 7c-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7z", "M9.0 12.0a3.0 3.0 0 1 0 6.0 0a3.0 3.0 0 1 0 -6.0 0Z") }
    val Filter: ImageVector by lazy { icon("filter", "M4 6h16M7 12h10M10 18h4") }
    val Frame: ImageVector by lazy { icon("frame", "M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4", "M9.5 12.0a2.5 2.5 0 1 0 5.0 0a2.5 2.5 0 1 0 -5.0 0Z") }
    val Layers: ImageVector by lazy { icon("layers", "M12 3l9 5-9 5-9-5 9-5z", "M3 12.5l9 5 9-5M3 16.5l9 5 9-5") }
    val List: ImageVector by lazy { icon("list", "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01") }
    val Manhole: ImageVector by lazy { icon("manhole", "M3.0 12.0a9.0 9.0 0 1 0 18.0 0a9.0 9.0 0 1 0 -18.0 0Z", "M7.5 8.5h9M6 12h12M7.5 15.5h9") }
    val MapPin: ImageVector by lazy { icon("map-pin", "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z", "M9.5 9.5a2.5 2.5 0 1 0 5.0 0a2.5 2.5 0 1 0 -5.0 0Z") }
    val Moon: ImageVector by lazy { icon("moon", "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z") }
    val Mount: ImageVector by lazy { icon("mount", "M5 2.5v19M5 6.5h3.5M5 17.5h2", "M10.5 5.0h7.0a1.0 1.0 0 0 1 1.0 1.0v10.0a1.0 1.0 0 0 1 -1.0 1.0h-7.0a1.0 1.0 0 0 1 -1.0 -1.0v-10.0a1.0 1.0 0 0 1 1.0 -1.0Z", "M8.5 6.5l1 .2") }
    val Plus: ImageVector by lazy { icon("plus", "M12 5v14M5 12h14") }
    val Pole: ImageVector by lazy { icon("pole", "M12 3v18M6.5 5.5h11M9 21h6M8 5.5V4M16 5.5V4M6.5 5.5c-.8 2-2 3.2-3.5 3.8M17.5 5.5c.8 2 2 3.2 3.5 3.8") }
    val Queue: ImageVector by lazy { icon("queue", "M4 13l2.5-7h11l2.5 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z", "M4 13h4.5l1 2h5l1-2H20") }
    val Route: ImageVector by lazy { icon("route", "M3.0 18.0a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0Z", "M17.0 6.0a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0Z", "M7 18h9a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h9") }
    val Search: ImageVector by lazy { icon("search", "M4.5 11.0a6.5 6.5 0 1 0 13.0 0a6.5 6.5 0 1 0 -13.0 0Z", "M20 20l-4.4-4.4") }
    val StatusCritical: ImageVector by lazy { icon("status-critical", "M13 2.8L4.6 13.4H11l-1 7.8 8.4-10.6H12l1-7.8z") }
    val StatusDefect: ImageVector by lazy { icon("status-defect", "M14.6 6.4a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5.5 5.5 0 0 1-7.3 7.3l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a5.5 5.5 0 0 1 7.3-7.3z") }
    val StatusNotObserved: ImageVector by lazy { icon("status-not-observed", "M3 3l18 18", "M10.6 5.1c.5-.1.9-.1 1.4-.1 5 0 8.5 4.5 9.5 7-.4 1-1.2 2.3-2.3 3.5", "M6.6 6.6C4.5 8 3.1 10.2 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.3", "M9.9 9.9a3 3 0 0 0 4.2 4.2") }
    val StatusOk: ImageVector by lazy { icon("status-ok", "M3.0 12.0a9.0 9.0 0 1 0 18.0 0a9.0 9.0 0 1 0 -18.0 0Z", "M8 12.3l2.7 2.7L16 9.7") }
    val StatusSuspected: ImageVector by lazy { icon("status-suspected", "M3.0 12.0a9.0 9.0 0 1 0 18.0 0a9.0 9.0 0 1 0 -18.0 0Z", "M9.6 9.7a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.4", "M12 16.9h.01") }
    val Sun: ImageVector by lazy { icon("sun", "M8.0 12.0a4.0 4.0 0 1 0 8.0 0a4.0 4.0 0 1 0 -8.0 0Z", "M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4") }
    val Upload: ImageVector by lazy { icon("upload", "M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4") }
    val UserCheck: ImageVector by lazy { icon("user-check", "M6.0 8.0a4.0 4.0 0 1 0 8.0 0a4.0 4.0 0 1 0 -8.0 0Z", "M3 20a7 7 0 0 1 10.5-6", "M15.5 18l2 2 4-4") }
    val User: ImageVector by lazy { icon("user", "M8.0 8.0a4.0 4.0 0 1 0 8.0 0a4.0 4.0 0 1 0 -8.0 0Z", "M4.5 20a7.5 7.5 0 0 1 15 0") }
}
