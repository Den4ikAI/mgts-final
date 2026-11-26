package ru.poputno.feature.auth.data

import ru.poputno.common.domain.model.Role
import ru.poputno.feature.auth.domain.DemoAccounts
import ru.poputno.feature.auth.domain.LastLoginStore

/** Заменится на DataStore/NSUserDefaults через expect/actual, когда появится хранилище. */
internal class InMemoryLastLoginStore : LastLoginStore {
    private var value = ""
    override fun read() = value
    override fun save(login: String) { value = login }
}

/** Учётки демо-стенда из docs/auth.md (SEED_DEMO_USERS, DEMO_PASSWORD). */
internal class StandDemoAccounts : DemoAccounts {
    override fun credentials(role: Role) = when (role) {
        Role.Admin -> "admin"
        Role.Dispatcher -> "dispatcher"
        Role.Manager -> "manager"
        Role.Brigade -> "tech"
    } to DEMO_PASSWORD

    private companion object { const val DEMO_PASSWORD = "mgts-demo" }
}
