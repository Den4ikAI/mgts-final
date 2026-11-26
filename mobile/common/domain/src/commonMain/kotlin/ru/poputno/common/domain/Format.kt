package ru.poputno.common.domain

/** Форматирование для голоса бренда: «26.11 10:42». Без зависимостей от kotlinx-datetime. */
fun Long.formatDayTime(offsetHours: Int = 3): String {
    val totalMin = this / 60_000 + offsetHours * 60
    val minutes = (totalMin % 60).toInt()
    val hours = ((totalMin / 60) % 24).toInt()
    val days = totalMin / (60 * 24)
    // 1970-01-01 + days -> день и месяц (григорианский календарь)
    val z = days + 719468
    val era = z / 146097
    val doe = z - era * 146097
    val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = (doy - (153 * mp + 2) / 5 + 1).toInt()
    val m = (if (mp < 10) mp + 3 else mp - 9).toInt()
    fun Int.p2() = toString().padStart(2, '0')
    return "${d.p2()}.${m.p2()} ${hours.p2()}:${minutes.p2()}"
}
