package ru.poputno.feature.auth.di

import ru.poputno.common.domain.repository.AuthRepository
import ru.poputno.core.di.ClosableGraph
import ru.poputno.core.di.single
import ru.poputno.feature.auth.data.InMemoryLastLoginStore
import ru.poputno.feature.auth.data.StandDemoAccounts
import ru.poputno.feature.auth.domain.LastLoginStore
import ru.poputno.feature.auth.domain.LoginUseCase

/** Что фиче нужно снаружи. Владелец передаёт только это, не весь граф данных. */
interface AuthDeps {
    val authRepository: AuthRepository
}

class AuthGraph(deps: AuthDeps) : ClosableGraph() {
    private val lastLogin: LastLoginStore by single { InMemoryLastLoginStore() }
    val loginUseCase by single { LoginUseCase(deps.authRepository, lastLogin, StandDemoAccounts()) }
    val lastLoginValue: String get() = lastLogin.read()
}
