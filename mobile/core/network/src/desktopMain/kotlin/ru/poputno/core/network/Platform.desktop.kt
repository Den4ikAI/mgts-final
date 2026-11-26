package ru.poputno.core.network

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.okhttp.OkHttp

internal actual fun platformBaseUrl() = System.getenv("POPUTNO_API") ?: STAND_BASE_URL
internal actual fun platformClient(block: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(OkHttp, block)
