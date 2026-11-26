package ru.poputno.feature.auth.domain

import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Session
import ru.poputno.common.domain.repository.AuthRepository
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome

class LoginUseCase(
    private val auth: AuthRepository,
    private val lastLogin: LastLoginStore,
    private val demo: DemoAccounts,
) {
    val serverUrl get() = auth.serverUrl

    suspend operator fun invoke(server: String, login: String, password: String): Outcome<Session> {
        if (server.isBlank()) return Outcome.Fail(AppError.Validation("server", "Укажите адрес сервера"))
        if (login.isBlank()) return Outcome.Fail(AppError.Validation("login", "Введите логин"))
        if (password.isBlank()) return Outcome.Fail(AppError.Validation("password", "Введите пароль"))
        auth.setServerUrl(server)
        return auth.login(login, password).also { if (it is Outcome.Ok) lastLogin.save(login.trim()) }
    }

    /** Демо-учётки сервера (SEED_DEMO_USERS): заполняет форму, вход обычный. */
    fun demoCredentials(role: Role): Pair<String, String> = demo.credentials(role)
}

/** Последний логин: подставляется в поле при следующем входе. */
interface LastLoginStore {
    fun read(): String
    fun save(login: String)
}

/** Демо-учётки стенда. Источник — конфиг сервера, не прод. */
fun interface DemoAccounts {
    fun credentials(role: Role): Pair<String, String>
}
