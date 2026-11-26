package ru.poputno.core.network

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.darwin.Darwin

/** Стенд по http: в Info.plist iOS-приложения нужен NSAppTransportSecurity → NSAllowsArbitraryLoads. */
internal actual fun platformBaseUrl() = STAND_BASE_URL
internal actual fun platformClient(block: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(Darwin, block)
