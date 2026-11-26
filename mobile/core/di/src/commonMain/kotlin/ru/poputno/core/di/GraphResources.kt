@file:OptIn(ExperimentalAtomicApi::class)

package ru.poputno.core.di

import kotlin.concurrent.atomics.AtomicReference
import kotlin.concurrent.atomics.ExperimentalAtomicApi

/**
 * Ресурсы одного поколения графа: закрываются в порядке, обратном регистрации, каждый получает
 * попытку закрытия, даже если предыдущий упал. Единственная реализация этого контракта в проекте —
 * графы, сборка приложения и откат после сбоя опираются на неё, а не на собственные списки.
 *
 * Регистрация потокобезопасна: `single` разных полей могут материализоваться с разных потоков.
 * После [close] владелец мёртв — ресурс, пришедший позже, закрывается сразу, а регистрация падает.
 */
class GraphResources(private val owner: String) : AutoCloseable {
    /** `null` — владелец закрыт. */
    private val owned = AtomicReference<List<() -> Unit>?>(emptyList())

    fun own(close: () -> Unit) {
        do {
            val current = owned.load() ?: rejectClosed(close)
        } while (!owned.compareAndSet(current, current + close))
    }

    fun checkOpen() {
        check(owned.load() != null) { "$owner is closed" }
    }

    /** Идемпотентно; первая ошибка закрытия пробрасывается, остальные прикрепляются к ней как suppressed. */
    override fun close() {
        val resources = owned.exchange(null) ?: return
        closeAll(resources.asReversed())
    }

    /** Закрытие после сбоя сборки: ошибки закрытия уходят в suppressed к [cause], а не заменяют её. */
    fun closeAfter(cause: Throwable) {
        val resources = owned.exchange(null) ?: return
        resources.asReversed().forEach(cause::closeSuppressing)
    }

    private fun rejectClosed(close: () -> Unit): Nothing {
        val error = IllegalStateException("$owner is closed")
        error.closeSuppressing(close)
        throw error
    }
}

/**
 * Поэтапная сборка поверх [GraphResources]: если [build] упал, всё зарегистрированное к этому
 * моменту закрывается в обратном порядке, а наружу уходит исходная ошибка.
 */
inline fun <T> GraphResources.closeOnFailure(build: () -> T): T = try {
    build()
} catch (error: Throwable) {
    closeAfter(error)
    throw error
}

/**
 * Граф, владеющий ресурсами своих `single(onClose)`-полей и того, что зарегистрировано через [own].
 * После [close] граф мёртв: закрываемые `single`, не успевшие создаться, больше не создаются.
 */
abstract class ClosableGraph : AutoCloseable {
    private val resources = GraphResources(owner = this::class.simpleName ?: "graph")

    /** Ресурс, созданный вне `single` (например, драйвер БД из конструктора); закрывается вместе с графом. */
    fun own(close: () -> Unit) = resources.own(close)

    /** Для выдачи наружу того, что уже создано: после [close] граф ничего не отдаёт. */
    fun checkOpen() = resources.checkOpen()

    override fun close() = resources.close()
}

/** Каждое действие получает попытку, даже если предыдущее упало; первая ошибка пробрасывается. */
fun closeAll(vararg actions: () -> Unit) = closeAll(actions.asList())

fun closeAll(actions: List<() -> Unit>) {
    var failure: Throwable? = null
    actions.forEach { action ->
        runCatching(action).onFailure { error ->
            val first = failure
            if (first == null) failure = error else if (error !== first) first.addSuppressed(error)
        }
    }
    failure?.let { throw it }
}

/** Закрывает ресурс после сбоя, не теряя ни исходную ошибку, ни ошибку закрытия. */
fun Throwable.closeSuppressing(close: () -> Unit) {
    runCatching(close).onFailure { closeError -> if (closeError !== this) addSuppressed(closeError) }
}
