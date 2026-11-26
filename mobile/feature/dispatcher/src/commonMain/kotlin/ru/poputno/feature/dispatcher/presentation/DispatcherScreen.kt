package ru.poputno.feature.dispatcher.presentation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import ru.poputno.common.domain.formatDayTime
import ru.poputno.common.domain.model.Detection
import ru.poputno.common.domain.model.RejectReason
import ru.poputno.common.domain.model.Verdict
import ru.poputno.common.map.MapPin
import ru.poputno.common.map.PpMap
import ru.poputno.common.map.mapsSupported
import ru.poputno.common.ui.layout.ScreenHeader
import ru.poputno.common.ui.mapping.toUi
import ru.poputno.common.ui.motion.AppearRegistry
import ru.poputno.common.ui.motion.SwipeAction
import ru.poputno.common.ui.motion.SwipeActions
import ru.poputno.common.ui.motion.appear
import ru.poputno.common.ui.motion.rememberAppearRegistry
import ru.poputno.common.ui.photo.DetectionPhoto
import ru.poputno.common.ui.photo.RemotePhoto
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpActionBar
import ru.poputno.core.designsystem.components.PpButton
import ru.poputno.core.designsystem.components.PpButtonSize
import ru.poputno.core.designsystem.components.PpButtonVariant
import ru.poputno.core.designsystem.components.PpCard
import ru.poputno.core.designsystem.components.PpEmpty
import ru.poputno.core.designsystem.components.PpIconButton
import ru.poputno.core.designsystem.components.PpLoader
import ru.poputno.core.designsystem.components.PpProvenance
import ru.poputno.core.designsystem.components.PpSegmented
import ru.poputno.core.designsystem.components.PpSeverity
import ru.poputno.core.designsystem.components.PpStatusPill
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.icons.PpIcons
import ru.poputno.feature.dispatcher.domain.QueueFilter

/**
 * Очередь диспетчера. Телефон: список, свайп вправо — «Подтвердить», влево — «Не дефект»;
 * тап — деталь поверх (назад закрывает). Планшет/desktop: список + деталь рядом, после
 * решения деталь сама переходит к следующему кадру.
 */
@Composable
fun DispatcherScreen(component: DispatcherComponent) {
    val s by component.state.collectAsState()
    val a = Pp.adaptive
    val m = Pp.motion
    val split = a.atLeastExpanded
    LaunchedEffect(split) { component.setOverlayMode(!split) }
    val registry = rememberAppearRegistry()
    val items = s.items
    Column(Modifier.fillMaxSize()) {
        ScreenHeader(
            "Очередь проверки",
            when {
                items == null -> "Загружаем кадры…"
                else -> "${s.total} кадров ждут решения · разобрано ${s.reviewedThisShift}"
            },
        )
        PpSegmented(QueueFilter.entries, s.filter, { it.title }, { component.accept(DispatcherIntent.Filter(it)) }, Modifier.padding(horizontal = Pp.space.page))
        s.error?.let { PpText(it, style = Pp.type.caption, color = Pp.colors.text.danger, modifier = Modifier.padding(horizontal = Pp.space.page, vertical = 6.dp)) }
        Spacer(Modifier.height(12.dp))
        when {
            items == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { PpLoader() }
            items.isEmpty() -> PpEmpty("Очередь пуста", "Новые кадры появятся после следующего проезда")
            split -> Row(Modifier.fillMaxSize().padding(horizontal = Pp.space.page), horizontalArrangement = Arrangement.spacedBy(Pp.space.x6)) {
                QueueList(items, s.selectedId, component, registry, Modifier.width(420.dp).fillMaxHeight(), swipe = false)
                val sel = s.selected ?: items.first()
                AnimatedContent(
                    sel, Modifier.weight(1f).fillMaxHeight(),
                    transitionSpec = { (fadeIn(tween(m.base)) + scaleIn(tween(m.base), initialScale = 0.98f)) togetherWith fadeOut(tween(m.exit)) },
                    contentKey = { it.id },
                ) { d -> DetectionDetail(d, onDecide = { v -> component.accept(DispatcherIntent.Decide(d, v)) }, onClose = null) }
            }
            else -> Box(Modifier.fillMaxSize()) {
                QueueList(items, s.selectedId, component, registry, Modifier.fillMaxSize(), swipe = true)
                s.selected?.let { d ->
                    Box(
                        Modifier.fillMaxSize().background(Pp.colors.surface.base)
                            // оверлей поглощает ввод: тапы и скролл не проходят в список под ним
                            .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent() } },
                    ) {
                        DetectionDetail(d, onDecide = { v -> component.accept(DispatcherIntent.Decide(d, v)) }, onClose = { component.accept(DispatcherIntent.Select(null)) })
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueList(
    items: List<Detection>,
    selectedId: String?,
    component: DispatcherComponent,
    registry: AppearRegistry,
    modifier: Modifier,
    swipe: Boolean,
) {
    val c = Pp.colors
    val confirm = remember(c) { SwipeAction("Подтвердить", PpIcons.Check, c.status.defect.solid, c.status.onSolid) }
    val reject = remember(c) { SwipeAction("Не дефект", PpIcons.StatusOk, c.status.ok.solid, c.status.onSolid) }
    LazyColumn(
        modifier,
        contentPadding = PaddingValues(start = if (swipe) Pp.space.page else 0.dp, end = if (swipe) Pp.space.page else 0.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        itemsIndexed(items, key = { _, d -> d.id }, contentType = { _, _ -> "detection" }) { index, d ->
            Box(Modifier.animateItem().appear(index, d.id, registry)) {
                if (swipe) {
                    SwipeActions(
                        start = confirm, end = reject,
                        onStart = { component.accept(DispatcherIntent.Decide(d, Verdict.Confirm)) },
                        onEnd = { component.accept(DispatcherIntent.Decide(d, Verdict.Reject(RejectReason.NotADefect))) },
                    ) { DetectionRow(d, selected = false) { component.accept(DispatcherIntent.Select(d.id)) } }
                } else {
                    DetectionRow(d, selected = d.id == selectedId) { component.accept(DispatcherIntent.Select(d.id)) }
                }
            }
        }
    }
}

@Composable
private fun DetectionRow(d: Detection, selected: Boolean, onClick: () -> Unit) {
    val c = Pp.colors
    PpCard(selected = selected, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // миниатюра: Coil декодирует под 64 dp, а не исходные мегапиксели
            RemotePhoto(d.photoUrl, Modifier.size(64.dp).clip(Pp.radii.control), iconSize = 20.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                PpText(d.objectId ?: d.kind.title, style = Pp.type.mono, maxLines = 1)
                PpText(d.defect?.title ?: "Объект не виден", style = Pp.type.label, maxLines = 1)
                PpText("${(d.confidence * 100).toInt()}% · ${d.createdAtMillis.formatDayTime()}", style = Pp.type.monoSm, color = c.text.muted, maxLines = 1)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PpStatusPill(d.status.toUi(), compact = true)
                d.severity?.let { PpSeverity(it.level) }
            }
        }
    }
}

/** Деталь: кадр с рамкой детекции, пояснение модели, рекомендация бригаде и решения. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DetectionDetail(d: Detection, onDecide: (Verdict) -> Unit, onClose: (() -> Unit)?) {
    val c = Pp.colors
    var rejecting by remember(d.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(if (onClose != null) Pp.space.page else 0.dp)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (onClose != null) Row(verticalAlignment = Alignment.CenterVertically) {
                PpIconButton(PpIcons.Close, onClose, size = 40.dp)
                Spacer(Modifier.width(12.dp))
                PpText(d.objectId ?: d.kind.title, style = Pp.type.mono)
            }
            // на телефоне кадр ниже (16:10): рекомендация бригаде должна быть видна без прокрутки
            Box(Modifier.fillMaxWidth().aspectRatio(if (Pp.adaptive.isCompact) 16f / 10f else 4f / 3f).clip(Pp.radii.card)) {
                DetectionPhoto(d.photoUrl, Modifier.fillMaxSize())
                PpProvenance(byModel = true, confidence = d.confidence, modifier = Modifier.align(Alignment.TopStart).padding(12.dp), onMedia = true)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PpStatusPill(d.status.toUi())
                d.severity?.let { PpSeverity(it.level) }
                Spacer(Modifier.weight(1f))
                PpText(d.createdAtMillis.formatDayTime(), style = Pp.type.monoSm, color = c.text.muted)
            }
            PpText(d.defect?.title ?: "Объект не виден", style = Pp.type.h3)
            PpText(listOfNotNull(d.kind.title, d.objectId).joinToString(" · "), style = Pp.type.bodySm, color = c.text.secondary)
            d.defect?.action?.let { action ->
                Column(
                    Modifier.fillMaxWidth().clip(Pp.radii.card).background(c.accent.subtle).padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    PpText("РЕКОМЕНДАЦИЯ БРИГАДЕ", style = Pp.type.micro, color = c.accent.fg)
                    PpText(action, style = Pp.type.bodySm)
                }
            }
            val point = d.point
            if (mapsSupported && point != null) {
                val pin = remember(d.id) { listOf(MapPin(d.id, point, d.status.toUi(), d.objectId ?: d.kind.title)) }
                PpText("ГДЕ СНЯТО", style = Pp.type.micro, color = c.text.muted)
                PpMap(pin, Modifier.fillMaxWidth().height(160.dp), focus = point)
            }
            d.rationale?.let {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PpText("ПОЧЕМУ", style = Pp.type.micro, color = c.text.muted)
                    PpText(it, style = Pp.type.bodySm, color = c.text.secondary)
                }
            }
        }
        // причины — прямо над кнопками, вне прокрутки: на телефоне видны сразу после «Не дефект»
        if (rejecting) {
            Spacer(Modifier.height(12.dp))
            PpText("ПРИЧИНА ОТКАЗА · МЕТКА ДЛЯ ДООБУЧЕНИЯ", style = Pp.type.micro, color = c.text.muted)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                RejectReason.entries.forEach { r ->
                    PpButton(r.title, { onDecide(Verdict.Reject(r)) }, variant = PpButtonVariant.Secondary, size = PpButtonSize.Sm, shape = Pp.radii.pill)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        // подписи кнопок не режутся: влезают — в ряд, нет — столбцом, «Подтвердить» последним (под пальцем)
        PpActionBar(Modifier.fillMaxWidth()) {
            PpButton(if (rejecting) "Отмена" else "Не дефект", { rejecting = !rejecting }, variant = PpButtonVariant.Secondary, size = PpButtonSize.Lg, leading = if (rejecting) PpIcons.Close else PpIcons.StatusOk)
            PpButton("Переснять", { onDecide(Verdict.NeedRecapture) }, variant = PpButtonVariant.Ghost, size = PpButtonSize.Lg, leading = PpIcons.Camera)
            PpButton("Подтвердить", { onDecide(Verdict.Confirm) }, variant = PpButtonVariant.Primary, size = PpButtonSize.Lg, leading = PpIcons.Check)
        }
    }
}
