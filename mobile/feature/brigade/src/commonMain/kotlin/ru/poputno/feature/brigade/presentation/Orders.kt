package ru.poputno.feature.brigade.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ComponentContext
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import ru.poputno.common.domain.formatDayTime
import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.common.domain.model.WorkOrderStatus
import ru.poputno.common.ui.layout.ScreenHeader
import ru.poputno.common.ui.mapping.icon
import ru.poputno.common.ui.motion.appear
import ru.poputno.common.ui.motion.rememberAppearRegistry
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpBadge
import ru.poputno.core.designsystem.components.PpCard
import ru.poputno.core.designsystem.components.PpEmpty
import ru.poputno.core.designsystem.components.PpRouteProgress
import ru.poputno.core.designsystem.components.PpSeverity
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.mvi.MviStore
import ru.poputno.core.mvi.retainedStore
import ru.poputno.feature.brigade.di.BrigadeGraph

@Immutable
data class OrdersState(
    val orders: List<WorkOrder> = emptyList(),
    val pendingUploads: Int = 0,
    val uploadError: String? = null,
    val loaded: Boolean = false,
)

internal class OrdersStore(graph: BrigadeGraph, brigadeId: String) : MviStore<Nothing, OrdersState, Nothing>(OrdersState()) {
    init {
        launch { graph.observeOrders(brigadeId).collectLatest { reduce { copy(orders = it, loaded = true) } } }
        launch { graph.uploads.pending.collectLatest { reduce { copy(pendingUploads = it) } } }
        launch { graph.uploads.lastError.collectLatest { reduce { copy(uploadError = it) } } }
    }
    override fun handle(intent: Nothing) = Unit
}

class OrdersComponent(
    context: ComponentContext,
    graph: BrigadeGraph,
    brigadeId: String,
    val onOpen: (String) -> Unit,
) : ComponentContext by context {
    private val store = retainedStore { OrdersStore(graph, brigadeId) }
    val state: StateFlow<OrdersState> = store.state
}

private val WorkOrderStatus.progress get() = when (this) {
    WorkOrderStatus.Draft -> 0f; WorkOrderStatus.Assigned -> 0.15f; WorkOrderStatus.EnRoute -> 0.4f
    WorkOrderStatus.InProgress -> 0.7f; WorkOrderStatus.Done -> 0.9f; WorkOrderStatus.Verified -> 1f
}

@Composable
fun OrdersScreen(component: OrdersComponent) {
    val s by component.state.collectAsState()
    val c = Pp.colors
    if (s.loaded && s.orders.isEmpty()) { PpEmpty("Нарядов нет", "Руководитель назначит наряд, он появится здесь"); return }
    val registry = rememberAppearRegistry()
    LazyVerticalGrid(
        GridCells.Fixed(Pp.adaptive.columns.coerceAtMost(3)),
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Pp.space.page, end = Pp.space.page, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            ScreenHeader(
                "Мои наряды",
                when {
                    s.uploadError != null -> s.uploadError!!
                    s.pendingUploads > 0 -> "Выгружаем фото: ${s.pendingUploads}"
                    else -> "Все фото на сервере"
                },
                inset = false,
            )
        }
        itemsIndexed(s.orders, key = { _, o -> o.id }, contentType = { _, _ -> "order" }) { i, o ->
            PpCard(Modifier.animateItem().appear(i, o.id, registry), onClick = { component.onOpen(o.id) }) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(40.dp).clip(Pp.radii.pill).background(c.surface.sunken), contentAlignment = Alignment.Center) {
                        PpIcon(o.kind.icon, size = 20.dp, tint = c.text.secondary)
                    }
                    Column(Modifier.weight(1f)) {
                        PpText(o.id, style = Pp.type.mono)
                        PpText(o.objectId, style = Pp.type.monoSm, color = c.text.muted)
                    }
                    PpSeverity(o.severity.level)
                }
                PpText(o.defect.title, style = Pp.type.title)
                PpText(o.address ?: o.kind.title, style = Pp.type.bodySm, color = c.text.secondary)
                PpRouteProgress(o.status.progress)
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    PpBadge(o.status.title, accent = o.status == WorkOrderStatus.InProgress)
                    Spacer(Modifier.weight(1f))
                    PpText("до ${o.dueAtMillis.formatDayTime()}", style = Pp.type.monoSm, color = c.text.muted)
                }
            }
        }
    }
}
