package ru.poputno.core.network

import io.ktor.client.call.body
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome

@kotlinx.serialization.Serializable
internal data class ErrorDto(val error: String)

/** Сеть → Outcome: исключения транспорта и коды ошибок не пролетают в домен. */
suspend inline fun <reified T> apiCall(block: () -> HttpResponse): Outcome<T> = try {
    val r = block()
    when {
        r.status.isSuccess() -> Outcome.Ok(if (T::class == Unit::class) Unit as T else r.body<T>())
        r.status == HttpStatusCode.Unauthorized -> Outcome.Fail(AppError.Unauthorized)
        r.status == HttpStatusCode.Forbidden -> Outcome.Fail(AppError.Validation("access", "Нет прав на это действие"))
        else -> Outcome.Fail(AppError.Unknown("HTTP ${r.status.value}"))
    }
} catch (e: CancellationException) {
    throw e
} catch (e: kotlinx.serialization.SerializationException) {
    println("poputno/api: ответ не разобран: ${e.message}")
    Outcome.Fail(AppError.Unknown("ответ сервера не разобран"))
} catch (e: Exception) {
    println("poputno/api: ${e::class.simpleName}: ${e.message}")
    Outcome.Fail(AppError.Network)
}
