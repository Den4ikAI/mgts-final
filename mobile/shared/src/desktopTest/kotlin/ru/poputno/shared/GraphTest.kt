package ru.poputno.shared

import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Session
import ru.poputno.common.domain.model.User
import ru.poputno.core.di.SessionContributor
import ru.poputno.shared.di.AppGraph
import ru.poputno.shared.di.SessionGraph
import kotlin.reflect.full.memberProperties
import kotlin.reflect.full.isSubtypeOf
import kotlin.reflect.full.starProjectedType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * Smoke-тест графов на JVM: здесь детектор циклов `single` гарантирован (на Native цикл —
 * зависание). Плюс полнота списка сессионных вкладов, как требует контракт SessionContributor.
 */
class GraphTest {
    private val app = AppGraph { 0L }
    private fun session(role: Role) = app.openSession(Session(User("u", "Тест", "t", role)))

    @Test
    fun everyFeatureGraphBuildsForEveryRole() {
        Role.entries.forEach { role ->
            session(role).use { g ->
                g.dispatcher; g.manager; g.admin
                if (role == Role.Brigade) { g.brigade; g.brigadeId }
            }
        }
        app.auth.loginUseCase
        app.close()
    }

    @Test
    fun contributorsListIsComplete() {
        val declared = SessionGraph::class.memberProperties
            .filter { it.returnType.isSubtypeOf(SessionContributor::class.starProjectedType) }
            .map { it.name }.toSet()
        val listed = session(Role.Dispatcher).use { g -> g.contributors.map { it.name }.toSet() }
        assertEquals(declared, listed, "каждый SessionContributor-граф должен быть в SessionGraph.contributors")
    }

    @Test
    fun closedGraphDoesNotHandOutNewInstances() {
        val g = session(Role.Dispatcher)
        g.close()
        assertFailsWith<IllegalStateException> { g.dispatcher }
    }
}
