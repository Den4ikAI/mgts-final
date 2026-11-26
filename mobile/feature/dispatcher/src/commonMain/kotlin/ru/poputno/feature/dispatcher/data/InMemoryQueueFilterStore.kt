package ru.poputno.feature.dispatcher.data

import kotlinx.coroutines.flow.MutableStateFlow
import ru.poputno.feature.dispatcher.domain.QueueFilter
import ru.poputno.feature.dispatcher.domain.QueueFilterStore

internal class InMemoryQueueFilterStore : QueueFilterStore {
    override val filter = MutableStateFlow(QueueFilter.All)
    override fun set(filter: QueueFilter) { this.filter.value = filter }
    fun reset() = set(QueueFilter.All)
}
