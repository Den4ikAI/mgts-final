package ru.poputno.feature.brigade.di

import ru.poputno.common.domain.repository.Clock
import ru.poputno.common.domain.repository.FrameRepository
import ru.poputno.common.domain.repository.WorkOrderRepository
import ru.poputno.core.di.ClosableGraph
import ru.poputno.core.di.LogoutCleaner
import ru.poputno.core.di.SessionContributions
import ru.poputno.core.di.SessionContributor
import ru.poputno.core.di.factory
import ru.poputno.core.di.single
import ru.poputno.feature.brigade.data.UploadQueue
import ru.poputno.feature.brigade.domain.AdvanceOrderUseCase
import ru.poputno.feature.brigade.domain.AttachPhotosUseCase
import ru.poputno.feature.brigade.domain.ObserveMyOrdersUseCase
import ru.poputno.feature.brigade.domain.PhotoUploadQueue

interface BrigadeDeps {
    val workOrderRepository: WorkOrderRepository
    val frameRepository: FrameRepository
    val clock: Clock
}

class BrigadeGraph(private val deps: BrigadeDeps) : ClosableGraph(), SessionContributor {
    val clock: Clock get() = deps.clock
    private val queue by single(onClose = UploadQueue::close) { UploadQueue(deps.frameRepository) }
    val uploads: PhotoUploadQueue get() = queue
    val observeOrders by factory { ObserveMyOrdersUseCase(deps.workOrderRepository) }
    val advance by factory { AdvanceOrderUseCase(deps.workOrderRepository) }
    val attachPhotos by factory { AttachPhotosUseCase(deps.workOrderRepository, uploads) }
    fun orderById(id: String) = deps.workOrderRepository.byId(id)

    /** Неотправленные кадры принадлежат сессии бригады: на logout очередь чистится. */
    override val sessionContributions = SessionContributions(logoutCleaners = listOf(LogoutCleaner { queue.clear() }))
}
