package ru.poputno.feature.manager.data

import ru.poputno.common.domain.model.Brigade
import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.feature.manager.domain.BrigadeSuggester

/** Локальная стратегия: бригада на смене с наименьшим числом активных нарядов. */
internal class LeastLoadedSuggester : BrigadeSuggester {
    override fun suggest(order: WorkOrder, brigades: List<Brigade>) =
        brigades.filter { it.onShift }.minByOrNull { it.activeOrders }
}
