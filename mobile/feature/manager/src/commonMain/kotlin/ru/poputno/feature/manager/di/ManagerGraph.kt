package ru.poputno.feature.manager.di

import ru.poputno.common.domain.repository.BrigadeRepository
import ru.poputno.common.domain.repository.ObjectRepository
import ru.poputno.common.domain.repository.WorkOrderRepository
import ru.poputno.core.di.ClosableGraph
import ru.poputno.core.di.factory
import ru.poputno.core.di.single
import ru.poputno.feature.manager.data.LeastLoadedSuggester
import ru.poputno.feature.manager.domain.AcceptWorkUseCase
import ru.poputno.feature.manager.domain.AssignOrderUseCase
import ru.poputno.feature.manager.domain.BrigadeSuggester
import ru.poputno.feature.manager.domain.CreateOrderUseCase
import ru.poputno.feature.manager.domain.LoadInboxUseCase
import ru.poputno.feature.manager.domain.ObserveBoardUseCase

interface ManagerDeps {
    val objectRepository: ObjectRepository
    val workOrderRepository: WorkOrderRepository
    val brigadeRepository: BrigadeRepository
}

class ManagerGraph(private val deps: ManagerDeps) : ClosableGraph() {
    private val suggester: BrigadeSuggester by single { LeastLoadedSuggester() }
    val observeBoard by factory { ObserveBoardUseCase(deps.workOrderRepository, deps.brigadeRepository, suggester) }
    val loadInbox by factory { LoadInboxUseCase(deps.objectRepository) }
    val ordersNow get() = deps.workOrderRepository.all()
    val createOrder by factory { CreateOrderUseCase(deps.workOrderRepository) }
    val assignOrder by factory { AssignOrderUseCase(deps.workOrderRepository) }
    val acceptWork by factory { AcceptWorkUseCase(deps.workOrderRepository) }
}
