package ru.poputno.core.network

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.okhttp.OkHttp

/** Стенд. Локальный API с эмулятора — http://10.0.2.2:8080 в поле «Сервер». */
internal actual fun platformBaseUrl() = STAND_BASE_URL
internal actual fun platformClient(block: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(OkHttp, block)
