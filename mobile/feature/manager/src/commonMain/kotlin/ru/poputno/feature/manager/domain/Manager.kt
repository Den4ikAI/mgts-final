package ru.poputno.feature.manager.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import ru.poputno.common.domain.model.Brigade
import ru.poputno.common.domain.model.InfraObject
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.common.domain.model.WorkOrderStatus
import ru.poputno.common.domain.repository.BrigadeRepository
import ru.poputno.common.domain.repository.ObjectRepository
import ru.poputno.common.domain.repository.WorkOrderRepository
import ru.poputno.core.common.Outcome

/** Наряд + кого предложить на него. Предложение считает домен, UI только показывает. */
data class OrderItem(val order: WorkOrder, val brigade: Brigade?, val suggested: Brigade?)

data class Board(
    val drafts: List<OrderItem>,
    val active: List<OrderItem>,
    val toAccept: List<OrderItem>,
    val brigadesOnShift: Int,
    val brigadesTotal: Int,
)

/** Кого предложить на наряд. Контракт фичи: стратегия может прийти с бэкенда. */
fun interface BrigadeSuggester {
    fun suggest(order: WorkOrder, brigades: List<Brigade>): Brigade?
}

class ObserveBoardUseCase(
    private val orders: WorkOrderRepository,
    private val brigades: BrigadeRepository,
    private val suggester: BrigadeSuggester,
) {
    operator fun invoke(): Flow<Board> = combine(orders.all(), brigades.brigades()) { o, b ->
        fun item(w: WorkOrder) = OrderItem(
            w, b.firstOrNull { it.id == w.brigadeId },
            if (w.status == WorkOrderStatus.Draft) suggester.suggest(w, b) else null,
        )
        Board(
            drafts = o.filter { it.status == WorkOrderStatus.Draft }.map(::item),
            active = o.filter { it.status in ACTIVE }.sortedBy { it.dueAtMillis }.map(::item),
            toAccept = o.filter { it.status == WorkOrderStatus.Done }.map(::item),
            brigadesOnShift = b.count { it.onShift },
            brigadesTotal = b.size,
        )
    }

    private companion object {
        val ACTIVE = setOf(WorkOrderStatus.Assigned, WorkOrderStatus.EnRoute, WorkOrderStatus.InProgress)
    }
}

/**
 * Входящие: объекты реестра в статусе «дефект» (подтверждены диспетчером или моделью),
 * по которым ещё нет наряда. Самые опасные сверху.
 */
class LoadInboxUseCase(private val objects: ObjectRepository) {
    suspend operator fun invoke(existing: List<WorkOrder>): Outcome<List<InfraObject>> =
        when (val r = objects.objects(ObjectStatus.Defect)) {
            is Outcome.Fail -> r
            is Outcome.Ok -> {
                val busy = existing.filter { it.status != WorkOrderStatus.Verified }.map { it.objectId }.toSet()
                Outcome.Ok(r.value.filter { it.id !in busy && it.defect != null }.sortedByDescending { it.severity?.level ?: 0 })
            }
        }
}

class CreateOrderUseCase(private val orders: WorkOrderRepository) {
    suspend operator fun invoke(obj: InfraObject): Outcome<WorkOrder> = orders.createFrom(obj)
}

class AssignOrderUseCase(private val orders: WorkOrderRepository) {
    suspend operator fun invoke(orderId: String, brigadeId: String) = orders.assign(orderId, brigadeId)
}

class AcceptWorkUseCase(private val orders: WorkOrderRepository) {
    suspend operator fun invoke(orderId: String) = orders.setStatus(orderId, WorkOrderStatus.Verified)
}
