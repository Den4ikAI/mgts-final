package ru.poputno.feature.brigade.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.common.domain.model.Severity
import ru.poputno.common.map.MapPin
import ru.poputno.common.map.PpMap
import ru.poputno.common.map.mapsSupported
import ru.poputno.common.map.openRoute
import ru.poputno.common.ui.mapping.toUi
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.arkivanov.decompose.ComponentContext
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import ru.poputno.common.domain.formatDayTime
import ru.poputno.common.domain.model.CaptureStep
import ru.poputno.common.domain.model.PhotoStage
import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.common.domain.model.WorkOrderStatus
import ru.poputno.common.ui.motion.appear
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpButton
import ru.poputno.core.designsystem.components.PpButtonSize
import ru.poputno.core.designsystem.components.PpButtonVariant
import ru.poputno.core.designsystem.components.PpIconButton
import ru.poputno.core.designsystem.components.PpSectionHeader
import ru.poputno.core.designsystem.components.PpSeverity
import ru.poputno.core.designsystem.components.PpTimelineItem
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.foundation.detectionCorners
import ru.poputno.core.designsystem.icons.PpIcons
import ru.poputno.core.mvi.MviStore
import ru.poputno.core.mvi.retainedStore
import ru.poputno.feature.brigade.di.BrigadeGraph

@Immutable
data class OrderState(val order: WorkOrder? = null, val canAdvance: Boolean = false)

sealed interface OrderIntent { data object Advance : OrderIntent }

internal class OrderStore(private val graph: BrigadeGraph, id: String) : MviStore<OrderIntent, OrderState, Nothing>(OrderState()) {
    private val advance = graph.advance
    init { launch { graph.orderById(id).collectLatest { o -> reduce { copy(order = o, canAdvance = o != null && advance.canAdvance(o)) } } } }
    override fun handle(intent: OrderIntent) {
        when (intent) { OrderIntent.Advance -> current.order?.let { launch { advance(it) } } }
    }
}

class OrderComponent(
    context: ComponentContext,
    graph: BrigadeGraph,
    id: String,
    val onBack: () -> Unit,
    val onShoot: (WorkOrder, PhotoStage) -> Unit,
) : ComponentContext by context {
    private val store = retainedStore { OrderStore(graph, id) }
    val state: StateFlow<OrderState> = store.state
    fun accept(i: OrderIntent) = store.accept(i)
}

private val WorkOrderStatus.nextLabel get() = when (this) {
    WorkOrderStatus.Assigned -> "Выехали"
    WorkOrderStatus.EnRoute -> "На объекте"
    WorkOrderStatus.InProgress -> "Ремонт выполнен"
    else -> null
}

@Composable
fun OrderScreen(component: OrderComponent) {
    val s by component.state.collectAsState()
    val o = s.order ?: return
    val c = Pp.colors
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(Pp.space.page).widthIn(max = 760.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PpIconButton(PpIcons.Close, component.onBack, size = 40.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    PpText(o.id, style = Pp.type.mono)
                    PpText(o.status.title, style = Pp.type.caption, color = c.text.muted)
                }
                PpSeverity(o.severity.level)
            }
            PpText(o.defect.title, style = Pp.type.h2, modifier = Modifier.appear(0))
            PpText(listOfNotNull("${o.kind.title} ${o.objectId}", o.address).joinToString(" · "), style = Pp.type.body, color = c.text.secondary, modifier = Modifier.appear(1))
            o.defect.action?.let { PpText(it, style = Pp.type.bodySm, color = c.text.accent, modifier = Modifier.appear(1)) }

            val point = o.point
            if (mapsSupported && point != null) {
                val pin = remember(o.id, point, o.severity) {
                    listOf(MapPin(o.id, point, (if (o.severity == Severity.Critical) ObjectStatus.Critical else ObjectStatus.Defect).toUi(), o.objectId))
                }
                PpMap(pin, Modifier.fillMaxWidth().height(180.dp).appear(2), focus = point)
                PpButton(
                    "Маршрут до объекта", { openRoute(point, o.objectId) }, Modifier.fillMaxWidth().appear(2),
                    PpButtonVariant.Secondary, PpButtonSize.Md, leading = PpIcons.Route, shape = Pp.radii.pill,
                )
            }
            PpSectionHeader("Фото", Modifier.appear(2))
            Row(Modifier.appear(3), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PhotoSlot(o, PhotoStage.Before, Modifier.weight(1f)) { component.onShoot(o, PhotoStage.Before) }
                PhotoSlot(o, PhotoStage.After, Modifier.weight(1f)) { component.onShoot(o, PhotoStage.After) }
            }

            PpSectionHeader("Ход наряда", Modifier.appear(4))
            Column(Modifier.appear(5)) {
                val order = listOf(WorkOrderStatus.Assigned, WorkOrderStatus.EnRoute, WorkOrderStatus.InProgress, WorkOrderStatus.Done)
                order.forEachIndexed { i, st ->
                    PpTimelineItem(
                        time = if (i == 0) o.createdAtMillis.formatDayTime() else "—",
                        text = st.title, done = o.status.ordinal >= st.ordinal, last = i == order.lastIndex,
                    )
                }
            }
        }
        // одна основная кнопка на экран, прибита к низу — большой палец достаёт
        o.status.nextLabel?.let { label ->
            Box(Modifier.fillMaxWidth().background(c.surface.raised).padding(Pp.space.page)) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PpButton(label, { component.accept(OrderIntent.Advance) }, Modifier.fillMaxWidth(), size = PpButtonSize.Lg, enabled = s.canAdvance, trailing = PpIcons.ArrowRight, shape = Pp.radii.pill)
                    if (!s.canAdvance && o.status == WorkOrderStatus.InProgress) PpText("Сначала снимите три кадра «после»", style = Pp.type.caption, color = c.text.muted)
                }
            }
        }
    }
}

@Composable
private fun PhotoSlot(o: WorkOrder, stage: PhotoStage, modifier: Modifier, onClick: () -> Unit) {
    val c = Pp.colors
    val have = o.photos.count { it.stage == stage }
    val total = CaptureStep.entries.size
    Column(
        modifier.clip(Pp.radii.card).background(c.surface.raised).border(1.dp, c.border.subtle, Pp.radii.card).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(Pp.radii.control).background(c.surface.sunken)
                .detectionCorners(if (have == total) c.status.ok.solid else c.accent.scan, arm = 12.dp, inset = 8.dp, progress = { if (have > 0) 1f else 0.6f }),
            contentAlignment = Alignment.Center,
        ) { PpIcon(PpIcons.Camera, size = 28.dp, tint = c.text.muted) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            PpText(stage.title, style = Pp.type.label, modifier = Modifier.weight(1f))
            PpText("$have/$total", style = Pp.type.monoSm, color = if (have == total) c.status.ok.fg else c.text.muted)
        }
        PpButton(if (have == 0) "Снять" else "Переснять", onClick, Modifier.fillMaxWidth(), PpButtonVariant.Secondary, PpButtonSize.Sm, leading = PpIcons.Camera, shape = Pp.radii.pill)
        Spacer(Modifier.height(0.dp))
    }
}
