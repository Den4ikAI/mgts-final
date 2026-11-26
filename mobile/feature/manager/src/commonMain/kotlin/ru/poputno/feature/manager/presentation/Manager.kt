package ru.poputno.feature.manager.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.height
import ru.poputno.common.map.MapPin
import ru.poputno.common.map.PpMap
import ru.poputno.common.map.mapsSupported
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ComponentContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import ru.poputno.common.domain.formatDayTime
import ru.poputno.common.domain.model.InfraObject
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.common.domain.model.Severity
import ru.poputno.common.domain.model.WorkOrderStatus
import ru.poputno.common.ui.layout.ScreenHeader
import ru.poputno.common.ui.mapping.toUi
import ru.poputno.common.ui.motion.AppearRegistry
import ru.poputno.common.ui.motion.appear
import ru.poputno.common.ui.motion.rememberAppearRegistry
import ru.poputno.core.common.Outcome
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpBadge
import ru.poputno.core.designsystem.components.PpButton
import ru.poputno.core.designsystem.components.PpButtonSize
import ru.poputno.core.designsystem.components.PpButtonVariant
import ru.poputno.core.designsystem.components.PpCard
import ru.poputno.core.designsystem.components.PpKpi
import ru.poputno.core.designsystem.components.PpSectionHeader
import ru.poputno.core.designsystem.components.PpSeverity
import ru.poputno.core.designsystem.components.PpStatusPill
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.icons.PpIcons
import ru.poputno.core.mvi.MviStore
import ru.poputno.core.mvi.retainedStore
import ru.poputno.feature.manager.di.ManagerGraph
import ru.poputno.feature.manager.domain.Board
import ru.poputno.feature.manager.domain.OrderItem

@Immutable
data class ManagerState(
    val board: Board? = null,
    val inbox: List<InfraObject>? = null,
    val busyIds: Set<String> = emptySet(),
    val error: String? = null,
)

sealed interface ManagerIntent {
    data class CreateOrder(val obj: InfraObject) : ManagerIntent
    data class Assign(val item: OrderItem) : ManagerIntent
    data class Accept(val item: OrderItem) : ManagerIntent
}

internal class ManagerStore(private val g: ManagerGraph) : MviStore<ManagerIntent, ManagerState, Nothing>(ManagerState()) {
    init {
        launch { g.observeBoard().collectLatest { b -> reduce { copy(board = b) } } }
        launch { while (true) { reloadInbox(); delay(30_000) } }
    }

    override fun handle(intent: ManagerIntent) {
        when (intent) {
            is ManagerIntent.CreateOrder -> busy(intent.obj.id) { g.createOrder(intent.obj).also { reloadInbox() } }
            is ManagerIntent.Assign -> {
                val brigade = intent.item.suggested ?: return
                busy(intent.item.order.id) { g.assignOrder(intent.item.order.id, brigade.id) }
            }
            is ManagerIntent.Accept -> busy(intent.item.order.id) { g.acceptWork(intent.item.order.id) }
        }
    }

    private suspend fun reloadInbox() {
        when (val r = g.loadInbox(g.ordersNow.first())) {
            is Outcome.Ok -> reduce { copy(inbox = r.value, error = null) }
            is Outcome.Fail -> reduce { copy(error = "Реестр объектов недоступен") }
        }
    }

    /** Повторный тап по той же карточке во время запроса игнорируется. */
    private fun busy(id: String, block: suspend () -> Outcome<*>) {
        if (id in current.busyIds) return
        reduce { copy(busyIds = busyIds + id) }
        launch {
            try {
                val r = block()
                if (r is Outcome.Fail) reduce { copy(error = "Не получилось: ${r.error}") }
            } finally {
                reduce { copy(busyIds = busyIds - id) }
            }
        }
    }
}

class ManagerComponent(context: ComponentContext, graph: ManagerGraph) : ComponentContext by context {
    private val store = retainedStore { ManagerStore(graph) }
    val state: StateFlow<ManagerState> = store.state
    fun accept(i: ManagerIntent) = store.accept(i)
}

/**
 * Доска руководителя: KPI, затем поток по жизни наряда — «Дефекты из реестра» → «Черновики» →
 * «В работе» → «Принять». Сетка перестраивается от 1 колонки на телефоне до 4 на мониторе.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ManagerScreen(component: ManagerComponent) {
    val s by component.state.collectAsState()
    val b = s.board ?: return
    val inbox = s.inbox.orEmpty()
    val registry = rememberAppearRegistry()
    LazyVerticalGrid(
        GridCells.Fixed(Pp.adaptive.columns),
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Pp.space.page, end = Pp.space.page, bottom = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }, contentType = "head") {
            Column {
                ScreenHeader("Наряды", "Бригад на смене: ${b.brigadesOnShift} из ${b.brigadesTotal}", inset = false)
                s.error?.let { PpText(it, style = Pp.type.caption, color = Pp.colors.text.danger, modifier = Modifier.padding(bottom = 8.dp)) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PpKpi("Дефекты", if (s.inbox == null) "…" else inbox.size.toString(), Modifier.width(160.dp), accent = inbox.isNotEmpty())
                    PpKpi("В работе", b.active.size.toString(), Modifier.width(160.dp))
                    PpKpi("Принять", b.toAccept.size.toString(), Modifier.width(160.dp))
                }
            }
        }
        if (mapsSupported) {
            item(span = { GridItemSpan(maxLineSpan) }, contentType = "map") {
                val pins = remember(inbox, b) { boardPins(inbox, b) }
                var selected by remember { mutableStateOf<String?>(null) }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PpSectionHeader("Карта · ${pins.size} с координатами", Modifier.padding(top = 16.dp))
                    PpMap(pins, Modifier.fillMaxWidth().height(260.dp), selectedId = selected, onPinClick = { selected = it })
                    pins.firstOrNull { it.id == selected }?.let { PpText(it.title, style = Pp.type.bodySm, color = Pp.colors.text.secondary) }
                }
            }
        }
        section("Дефекты из реестра · без наряда", inbox.size)
        itemsIndexed(inbox, key = { _, o -> "obj-" + o.id }, contentType = { _, _ -> "object" }) { i, o ->
            ObjectCard(o, busy = o.id in s.busyIds, Modifier.animateItem().appear(i, o.id, registry)) {
                component.accept(ManagerIntent.CreateOrder(o))
            }
        }
        orders("Черновики · без бригады", b.drafts, s.busyIds, registry) { component.accept(ManagerIntent.Assign(it)) }
        orders("В работе", b.active, s.busyIds, registry, null)
        orders("Выполнены · принять работу", b.toAccept, s.busyIds, registry) { component.accept(ManagerIntent.Accept(it)) }
    }
}

/** Метки карты: дефекты реестра (по статусу) и активные наряды (по опасности). */
private fun boardPins(inbox: List<InfraObject>, b: Board): List<MapPin> =
    inbox.mapNotNull { o -> o.point?.let { MapPin(o.id, it, o.status.toUi(), "${o.id} · ${o.defect?.title ?: o.kind.title}") } } +
        (b.drafts + b.active).mapNotNull { it.order.point?.let { p ->
            MapPin(it.order.id, p, (if (it.order.severity == Severity.Critical) ObjectStatus.Critical else ObjectStatus.Defect).toUi(), "${it.order.id} · ${it.order.defect.title} · ${it.brigade?.name ?: "без бригады"}")
        } }

private fun LazyGridScope.section(title: String, count: Int) {
    item(span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
        PpSectionHeader(title, Modifier.padding(top = 16.dp)) { PpBadge(count.toString()) }
    }
}

private fun LazyGridScope.orders(
    title: String,
    list: List<OrderItem>,
    busyIds: Set<String>,
    registry: AppearRegistry,
    action: ((OrderItem) -> Unit)?,
) {
    section(title, list.size)
    itemsIndexed(list, key = { _, it -> it.order.id }, contentType = { _, _ -> "order" }) { i, item ->
        OrderCard(item, busy = item.order.id in busyIds, action = action?.let { a -> { a(item) } }, Modifier.animateItem().appear(i, item.order.id, registry))
    }
}

@Composable
private fun ObjectCard(o: InfraObject, busy: Boolean, modifier: Modifier, onCreate: () -> Unit) {
    PpCard(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PpText(o.id, style = Pp.type.mono, modifier = Modifier.weight(1f), maxLines = 1)
            o.severity?.let { PpSeverity(it.level) }
        }
        PpText(o.defect?.title ?: "—", style = Pp.type.title)
        PpText(listOfNotNull(o.kind.title, o.address).joinToString(" · "), style = Pp.type.caption, color = Pp.colors.text.muted)
        o.defect?.action?.let { PpText(it, style = Pp.type.caption, color = Pp.colors.text.secondary) }
        PpButton("Создать наряд", onCreate, Modifier.fillMaxWidth(), size = PpButtonSize.Sm, enabled = !busy, leading = PpIcons.Plus)
    }
}

/** Карточка получает только своё: изменение чужого busy её не перерисовывает. */
@Composable
private fun OrderCard(item: OrderItem, busy: Boolean, action: (() -> Unit)?, modifier: Modifier) {
    val c = Pp.colors
    val o = item.order
    PpCard(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PpText(o.id, style = Pp.type.mono, modifier = Modifier.weight(1f))
            PpBadge(o.status.title, accent = o.status == WorkOrderStatus.InProgress)
        }
        PpText(o.defect.title, style = Pp.type.title)
        PpText(listOfNotNull(o.objectId, o.address).joinToString(" · "), style = Pp.type.caption, color = c.text.muted)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PpStatusPill((if (o.severity == Severity.Critical) ObjectStatus.Critical else ObjectStatus.Defect).toUi(), compact = true)
            Spacer(Modifier.weight(1f))
            PpText("до ${o.dueAtMillis.formatDayTime()}", style = Pp.type.monoSm, color = c.text.muted)
        }
        item.brigade?.let { PpText("${it.name} · ${it.vehicle}", style = Pp.type.caption, color = c.text.secondary) }
        if (action != null) {
            val label = when (o.status) {
                WorkOrderStatus.Draft -> item.suggested?.let { "Назначить: ${it.name}" } ?: "Нет бригады на смене"
                else -> "Принять работу"
            }
            Box { PpButton(label, action, Modifier.fillMaxWidth(), PpButtonVariant.Secondary, PpButtonSize.Sm, enabled = !busy && (o.status != WorkOrderStatus.Draft || item.suggested != null)) }
        }
    }
}
