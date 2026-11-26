package ru.poputno.feature.dispatcher.presentation

import androidx.compose.runtime.Immutable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import ru.poputno.common.domain.model.Detection
import ru.poputno.common.domain.model.Verdict
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome
import ru.poputno.core.mvi.MviStore
import ru.poputno.feature.dispatcher.di.DispatcherGraph
import ru.poputno.feature.dispatcher.domain.QueueFilter

@Immutable
data class DispatcherState(
    val items: List<Detection>? = null,
    val total: Int = 0,
    val filter: QueueFilter = QueueFilter.All,
    val selectedId: String? = null,
    val reviewedThisShift: Int = 0,
    val refreshing: Boolean = false,
    val error: String? = null,
) {
    val selected: Detection? get() = items?.firstOrNull { it.id == selectedId }
}

sealed interface DispatcherIntent {
    data class Filter(val filter: QueueFilter) : DispatcherIntent
    data class Select(val id: String?) : DispatcherIntent
    data class Decide(val detection: Detection, val verdict: Verdict) : DispatcherIntent
    data object Refresh : DispatcherIntent
}

internal class DispatcherStore(private val g: DispatcherGraph) :
    MviStore<DispatcherIntent, DispatcherState, Nothing>(DispatcherState()) {

    init {
        launch { g.observeQueue().collectLatest { q -> reduce { copy(items = q.items, total = q.total) } } }
        launch { g.filterStore.filter.collectLatest { f -> reduce { copy(filter = f) } } }
        // очередь обновляется сама: новые кадры от ML приходят каждые несколько секунд
        launch { while (true) { refresh(); delay(POLL_MS) } }
    }

    override fun handle(intent: DispatcherIntent) {
        when (intent) {
            is DispatcherIntent.Filter -> g.filterStore.set(intent.filter)
            is DispatcherIntent.Select -> reduce { copy(selectedId = intent.id) }
            DispatcherIntent.Refresh -> launch { refresh() }
            is DispatcherIntent.Decide -> decide(intent.detection, intent.verdict)
        }
    }

    private fun decide(d: Detection, verdict: Verdict) {
        // следующий кадр выбираем до запроса: диспетчер идёт по очереди без возврата к списку
        val items = current.items.orEmpty()
        val next = items.getOrNull(items.indexOfFirst { it.id == d.id } + 1)?.id
        if (current.selectedId == d.id) reduce { copy(selectedId = next) }
        launch {
            when (val r = g.review(d, verdict)) {
                is Outcome.Ok -> reduce { copy(reviewedThisShift = reviewedThisShift + 1, error = null) }
                is Outcome.Fail -> reduce { copy(error = r.error.message()) }
            }
        }
    }

    private suspend fun refresh() {
        reduce { copy(refreshing = true) }
        val r = g.refreshQueue()
        reduce { copy(refreshing = false, error = (r as? Outcome.Fail)?.error?.message()) }
    }

    private fun AppError.message() = when (this) {
        AppError.Network -> "Нет связи с сервером"
        AppError.Unauthorized -> "Сессия истекла"
        is AppError.Validation -> message
        is AppError.Unknown -> "Ошибка сервера: $message"
    }

    private companion object { const val POLL_MS = 15_000L }
}
