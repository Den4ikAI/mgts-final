package ru.poputno.core.di

import kotlin.reflect.KProperty1

/** Чистит сессионное состояние графа на logout (кэш, БД, очередь выгрузки фото). */
fun interface LogoutCleaner {
    suspend fun clear()
}

/** Прогревает данные сессии сразу после входа (наряды бригады, очередь диспетчера). */
class SessionPrefetcherEntry(val name: String, val prefetch: suspend () -> Unit)

/**
 * Граф, владеющий сессионным состоянием: БД, кэшем или префетчем, которые живут и умирают вместе
 * с сессией. Реализуют его только такие графы — у остальных вкладов нет, и logout их не создаёт.
 *
 * Владелец, собравший графы, обязан перечислить каждое своё поле этого типа в списке вкладов
 * (см. [sessionContributionsOf]); полноту списка проверяет тест владельца, поэтому фича, у которой
 * появилось состояние, не может молча остаться без зачистки на logout.
 */
interface SessionContributor {
    val sessionContributions: SessionContributions
}

/** Что граф добавляет к жизненному циклу сессии; собирается владельцем через [sessionContributionsOf]. */
class SessionContributions(
    val logoutCleaners: List<LogoutCleaner> = emptyList(),
    val prefetchers: List<SessionPrefetcherEntry> = emptyList(),
)

fun Iterable<SessionContributor>.sessionContributions(): SessionContributions = SessionContributions(
    logoutCleaners = flatMap { it.sessionContributions.logoutCleaners },
    prefetchers = flatMap { it.sessionContributions.prefetchers },
)

/**
 * Вклады перечисленных полей графа. Поля заданы ссылками, а не значениями: их перечень виден тесту
 * полноты без создания графа, а сами графы фич создаются только здесь — на входе или logout.
 */
fun <G> G.sessionContributionsOf(contributors: List<KProperty1<G, SessionContributor>>): SessionContributions =
    contributors.map { it.get(this) }.sessionContributions()
