package ru.poputno.feature.dispatcher.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import ru.poputno.common.domain.model.Detection
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.common.domain.model.Verdict
import ru.poputno.common.domain.repository.DetectionRepository

enum class QueueFilter(val title: String) { All("Все"), Critical("Критично"), Defect("Дефекты"), Unclear("Неясно") }

/** Фильтр очереди — состояние фичи, а не экрана: переживает уход на деталь и обратно. */
interface QueueFilterStore {
    val filter: Flow<QueueFilter>
    fun set(filter: QueueFilter)
}

/** null — очередь ещё не загружена (отличаем от пустой). */
data class Queue(val items: List<Detection>?, val total: Int)

/** Критичное всегда сверху (тревога в обход очереди), дальше по опасности и свежести. */
class ObserveQueueUseCase(private val repo: DetectionRepository, private val filters: QueueFilterStore) {
    operator fun invoke(): Flow<Queue> = combine(repo.queue, filters.filter) { list, f ->
        Queue(list?.filter { it.matches(f) }?.sortedWith(ORDER), list?.size ?: 0)
    }

    private fun Detection.matches(f: QueueFilter) = when (f) {
        QueueFilter.All -> true
        QueueFilter.Critical -> status == ObjectStatus.Critical
        QueueFilter.Defect -> status == ObjectStatus.Defect
        QueueFilter.Unclear -> status == ObjectStatus.NotObserved || status == ObjectStatus.Ok
    }

    private companion object {
        val ORDER = compareByDescending<Detection> { it.status == ObjectStatus.Critical }
            .thenByDescending { it.severity?.level ?: 0 }
            .thenByDescending { it.createdAtMillis }
    }
}

class RefreshQueueUseCase(private val repo: DetectionRepository) {
    suspend operator fun invoke() = repo.refresh()
}

class ReviewDetectionUseCase(private val repo: DetectionRepository) {
    suspend operator fun invoke(detection: Detection, verdict: Verdict) = repo.review(detection, verdict)
}
