package ru.poputno.feature.brigade.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import ru.poputno.common.domain.model.CaptureStep
import ru.poputno.common.domain.model.EvidencePhoto
import ru.poputno.common.domain.model.PhotoStage
import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.common.domain.model.WorkOrderStatus
import ru.poputno.common.domain.repository.WorkOrderRepository
import ru.poputno.common.domain.usecase.NextOrderStatusUseCase

/**
 * Очередь выгрузки кадров на сервер (`POST /api/frames`): бригада снимает без сети,
 * кадры уходят, когда сеть появится. Ключ — (наряд, этап, шаг): пересъёмка заменяет кадр,
 * а не добавляет дубль. Контракт фичи; реализация в data.
 */
interface PhotoUploadQueue {
    /** Сколько кадров ещё не на сервере. */
    val pending: StateFlow<Int>
    /** Последняя ошибка выгрузки (нет сети и т.п.), null — всё ушло. */
    val lastError: StateFlow<String?>
    fun enqueue(orderId: String, objectId: String, photo: EvidencePhoto)
    fun retry()
    suspend fun clear()
}

class ObserveMyOrdersUseCase(private val repo: WorkOrderRepository) {
    operator fun invoke(brigadeId: String): Flow<List<WorkOrder>> = repo.forBrigade(brigadeId).map { list ->
        list.filter { it.status != WorkOrderStatus.Verified }
            .sortedWith(compareBy<WorkOrder> { it.status == WorkOrderStatus.Done }.thenByDescending { it.severity.level }.thenBy { it.dueAtMillis })
    }
}

class AdvanceOrderUseCase(private val repo: WorkOrderRepository, private val next: NextOrderStatusUseCase = NextOrderStatusUseCase()) {
    /** Закрыть наряд можно только с полным набором кадров «после». */
    fun canAdvance(order: WorkOrder): Boolean {
        val n = next(order) ?: return false
        return n != WorkOrderStatus.Done || order.photos.count { it.stage == PhotoStage.After } >= CaptureStep.entries.size
    }
    suspend operator fun invoke(order: WorkOrder) { next(order)?.let { if (canAdvance(order)) repo.setStatus(order.id, it) } }
}

class AttachPhotosUseCase(private val repo: WorkOrderRepository, private val uploads: PhotoUploadQueue) {
    suspend operator fun invoke(orderId: String, objectId: String, photos: List<EvidencePhoto>) = photos.forEach {
        repo.attachPhoto(orderId, it)
        uploads.enqueue(orderId, objectId, it)
    }
}
