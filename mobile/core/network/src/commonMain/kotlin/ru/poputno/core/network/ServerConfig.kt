package ru.poputno.core.network

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Адрес API. По умолчанию — платформенный ([defaultBaseUrl]): эмулятор Android ходит на хост
 * через 10.0.2.2, desktop и симулятор iOS — на localhost. На реальном телефоне адрес меняется
 * на экране входа.
 */
class ServerConfig(initial: String = defaultBaseUrl()) {
    private val url = MutableStateFlow(initial.normalized())
    val baseUrl: StateFlow<String> = url.asStateFlow()
    fun set(value: String) { url.value = value.normalized() }

    /** Полный адрес медиа из относительного пути API (`/api/media/МП. ТКШ/1.jpg`) с кодированием сегментов. */
    fun mediaUrl(path: String): String = baseUrl.value + encodePath(path)

    private fun String.normalized() = trim().trimEnd('/').let { if ("://" in it) it else "http://$it" }
}

/** Стенд «Попутно». Другой адрес — поле «Сервер» на входе (desktop: переменная POPUTNO_API). */
const val STAND_BASE_URL = "http://87.242.101.125:25565"

internal expect fun platformBaseUrl(): String
fun defaultBaseUrl(): String = platformBaseUrl()

/** Кодирует каждый сегмент пути (кириллица, пробелы), сохраняя разделители. */
fun encodePath(path: String): String = path.split('/').joinToString("/") { seg ->
    buildString {
        seg.encodeToByteArray().forEach { b ->
            val c = (b.toInt() and 0xFF)
            val ch = c.toChar()
            if (ch.isLetterOrDigit() && c < 0x80 || ch in "-._~") append(ch)
            else append('%').append(HEX[c shr 4]).append(HEX[c and 0xF])
        }
    }
}

private const val HEX = "0123456789ABCDEF"
