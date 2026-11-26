package ru.poputno.common.domain.usecase

import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.common.domain.model.WorkOrderStatus

/** Следующий допустимый статус наряда для бригады (нельзя перепрыгнуть «на объекте»). */
class NextOrderStatusUseCase {
    operator fun invoke(order: WorkOrder): WorkOrderStatus? = when (order.status) {
        WorkOrderStatus.Assigned -> WorkOrderStatus.EnRoute
        WorkOrderStatus.EnRoute -> WorkOrderStatus.InProgress
        WorkOrderStatus.InProgress -> WorkOrderStatus.Done
        else -> null
    }
}
