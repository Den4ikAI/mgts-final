package ru.poputno.feature.dispatcher.di

import ru.poputno.common.domain.repository.DetectionRepository
import ru.poputno.core.di.ClosableGraph
import ru.poputno.core.di.LogoutCleaner
import ru.poputno.core.di.SessionContributions
import ru.poputno.core.di.SessionContributor
import ru.poputno.core.di.factory
import ru.poputno.core.di.single
import ru.poputno.feature.dispatcher.data.InMemoryQueueFilterStore
import ru.poputno.feature.dispatcher.domain.ObserveQueueUseCase
import ru.poputno.feature.dispatcher.domain.QueueFilterStore
import ru.poputno.feature.dispatcher.domain.RefreshQueueUseCase
import ru.poputno.feature.dispatcher.domain.ReviewDetectionUseCase

interface DispatcherDeps {
    val detectionRepository: DetectionRepository
}

class DispatcherGraph(private val deps: DispatcherDeps) : ClosableGraph(), SessionContributor {
    private val filters by single { InMemoryQueueFilterStore() }
    val filterStore: QueueFilterStore get() = filters
    val observeQueue by factory { ObserveQueueUseCase(deps.detectionRepository, filters) }
    val refreshQueue by factory { RefreshQueueUseCase(deps.detectionRepository) }
    val review by factory { ReviewDetectionUseCase(deps.detectionRepository) }

    /** Фильтр очереди сессионный: на logout сбрасывается. */
    override val sessionContributions = SessionContributions(logoutCleaners = listOf(LogoutCleaner { filters.reset() }))
}
