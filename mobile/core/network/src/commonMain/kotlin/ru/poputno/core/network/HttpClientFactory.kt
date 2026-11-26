package ru.poputno.core.network

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.auth.Auth
import io.ktor.client.plugins.auth.authProvider
import io.ktor.client.plugins.auth.providers.BearerAuthProvider
import io.ktor.client.plugins.auth.providers.BearerTokens
import io.ktor.client.plugins.auth.providers.bearer
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.cookies.AcceptAllCookiesStorage
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNamingStrategy
import io.ktor.client.call.body

@OptIn(ExperimentalSerializationApi::class)
val ApiJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    namingStrategy = JsonNamingStrategy.SnakeCase
}

/** Ответ /api/auth/login и /api/auth/refresh в части, нужной клиенту. */
@kotlinx.serialization.Serializable
data class TokenDto(val accessToken: String, val expiresIn: Long)

/**
 * Хранилище access-токена. Refresh живёт в cookie `mgts_refresh` (HttpCookies),
 * клиент его не видит — как в браузере.
 */
class TokenHolder {
    @kotlin.concurrent.Volatile var accessToken: String? = null
}

internal expect fun platformClient(block: HttpClientConfig<*>.() -> Unit): HttpClient

/**
 * Клиент API. На 401 Ktor сам вызывает refresh (cookie уйдёт автоматически),
 * повторяет запрос с новым токеном; если refresh не прошёл — [onSessionExpired].
 */
class ApiClient(
    val config: ServerConfig,
    private val tokens: TokenHolder = TokenHolder(),
    private val onSessionExpired: () -> Unit = {},
) {
    val http: HttpClient = platformClient {
        expectSuccess = false
        install(ContentNegotiation) { json(ApiJson) }
        install(HttpCookies) { storage = AcceptAllCookiesStorage() }
        install(HttpTimeout) {
            connectTimeoutMillis = 8_000
            requestTimeoutMillis = 60_000 // загрузка фото до 20 МБ
        }
        defaultRequest { url(config.baseUrl.value + "/") }
        install(Auth) {
            bearer {
                loadTokens { tokens.accessToken?.let { BearerTokens(it, null) } }
                refreshTokens {
                    val r: HttpResponse = client.post("api/auth/refresh") {
                        markAsRefreshTokenRequest()
                        contentType(ContentType.Application.Json)
                        setBody("{}")
                    }
                    if (!r.status.isSuccess()) { tokens.accessToken = null; onSessionExpired(); return@refreshTokens null }
                    val t: TokenDto = r.body()
                    tokens.accessToken = t.accessToken
                    BearerTokens(t.accessToken, null)
                }
                // токен не шлём на вход и обновление
                sendWithoutRequest { req -> "api/auth/login" !in req.url.buildString() }
            }
        }
    }

    fun setAccessToken(token: String?) {
        tokens.accessToken = token
        // сбросить закэшированный провайдером токен, чтобы следующий запрос взял новый
        http.authProvider<BearerAuthProvider>()?.clearToken()
    }

    val accessToken: String? get() = tokens.accessToken

    fun close() = http.close()
}

