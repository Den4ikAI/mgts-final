package ru.poputno.common.camera.presentation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.key
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import ru.poputno.common.domain.formatDayTime
import ru.poputno.common.domain.model.CaptureStep
import ru.poputno.common.domain.model.PhotoStage
import ru.poputno.common.camera.platform.CameraPreview
import ru.poputno.common.camera.platform.rememberCameraController
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.PpDarkSurface
import ru.poputno.core.designsystem.components.PpActionBar
import ru.poputno.core.designsystem.components.PpButton
import ru.poputno.core.designsystem.components.PpButtonSize
import ru.poputno.core.designsystem.components.PpButtonVariant
import ru.poputno.core.designsystem.components.PpIconButton
import ru.poputno.core.designsystem.components.PpRouteSteps
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.foundation.detectionCorners
import ru.poputno.core.designsystem.icons.PpIcons
import ru.poputno.core.permissions.Permission
import ru.poputno.core.permissions.PermissionStatus
import ru.poputno.core.permissions.rememberPermissionState

/**
 * Камера бригады. Всегда тёмная (кадр — главное). Слои снизу вверх:
 *  1. живое превью;
 *  2. виньетка-маска: вне рамки прицела кадр притушен, чтобы взгляд шёл в рамку;
 *  3. рамка прицела из уголков детекции + сканирующая линия «камера ищет»;
 *  4. стеклянные капсулы управления: шапка, шаги на линии маршрута, подсказка, затвор.
 * Затвор — знак «Попутно»: уголки сжимаются к точке при нажатии, точка вспыхивает при снимке.
 */
@Composable
fun CameraScreen(component: CameraComponent) {
    val state by component.state.collectAsState()
    PpDarkSurface {
        val permission = rememberPermissionState(Permission.Camera)
        LaunchedEffect(permission.status) {
            if (permission.status == PermissionStatus.NotDetermined) permission.request()
        }
        Box(Modifier.fillMaxSize().background(Pp.colors.surface.sunken)) {
            when (permission.status) {
                PermissionStatus.Granted -> CameraContent(state, component::accept)
                else -> PermissionGate(
                    forever = permission.status == PermissionStatus.DeniedForever,
                    onRequest = permission::request,
                    onSettings = permission::openSettings,
                    onClose = { component.accept(CameraIntent.Close) },
                )
            }
        }
    }
}

@Composable
private fun CameraContent(state: CameraState, accept: (CameraIntent) -> Unit) {
    val controller = rememberCameraController()
    val c = Pp.colors
    val m = Pp.motion

    LaunchedEffect(state.torch) { controller.setTorch(state.torch) }
    LaunchedEffect(state.phase) {
        if (state.phase == CameraState.Phase.Capturing) accept(CameraIntent.Captured(controller.capture()))
    }

    // вспышка затвора: один слой alpha поверх кадра
    val flash = remember { Animatable(0f) }
    LaunchedEffect(state.phase) {
        if (state.phase == CameraState.Phase.Review) {
            flash.snapTo(0.55f); flash.animateTo(0f, tween(m.slow, easing = m.easeOut))
        }
    }

    Box(Modifier.fillMaxSize()) {
        CameraPreview(controller, Modifier.fillMaxSize())
        Viewfinder(state)
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = flash.value }.background(c.onMedia))

        Column(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TopBar(state, accept)
            Spacer(Modifier.height(12.dp))
            Glass(Modifier.fillMaxWidth().widthIn(max = 520.dp)) {
                PpRouteSteps(state.steps.map { it.title }, state.currentIndex, onMedia = true, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp))
            }
            Spacer(Modifier.height(10.dp))
            AnimatedContent(
                targetState = state.current,
                transitionSpec = {
                    (fadeIn(tween(m.base)) + slideInVertically(tween(m.base, easing = m.easeOut)) { -it / 3 }) togetherWith
                        (fadeOut(tween(m.exit)) + slideOutVertically(tween(m.exit)) { it / 3 })
                },
            ) { step -> HintCapsule(state.hint ?: step.hint, isError = state.hint != null) }
            Spacer(Modifier.weight(1f))
            AnimatedContent(
                targetState = state.phase == CameraState.Phase.Review || state.phase == CameraState.Phase.Summary,
                transitionSpec = { fadeIn(tween(m.base)) togetherWith fadeOut(tween(m.exit)) },
            ) { reviewing ->
                if (!reviewing) {
                    ShutterRow(state, accept)
                } else if (state.phase == CameraState.Phase.Summary) {
                    SummaryBar(state, accept)
                } else {
                    ReviewBar(accept)
                }
            }
        }
    }
}

@Composable
private fun TopBar(state: CameraState, accept: (CameraIntent) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        PpIconButton(PpIcons.Close, { accept(CameraIntent.Close) }, size = 44.dp, onMedia = true)
        Spacer(Modifier.width(10.dp))
        Glass(Modifier.weight(1f)) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
                PpText(state.title, style = Pp.type.monoSm, color = Pp.colors.onMedia, maxLines = 1)
                PpText(state.subtitle, style = Pp.type.caption, color = Pp.colors.onMediaMuted, maxLines = 1)
            }
        }
        Spacer(Modifier.width(10.dp))
        PpIconButton(PpIcons.Sun, { accept(CameraIntent.ToggleTorch) }, size = 44.dp, onMedia = true, active = state.torch)
    }
}

@Composable
private fun HintCapsule(text: String, isError: Boolean) {
    Glass {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PpIcon(if (isError) PpIcons.Alert else PpIcons.Frame, size = 16.dp, tint = if (isError) Pp.colors.text.danger else Pp.colors.accent.scan)
            PpText(text, style = Pp.type.label, color = Pp.colors.onMedia, maxLines = 1)
        }
    }
}

/**
 * Прицел. Маска вне рамки притушена; пока целимся — уголки «дышат» и по рамке идёт
 * сканирующая линия. На снимке уголки защёлкиваются (snap 1.15 → 1) и зеленеют.
 * Бесконечные анимации существуют только в фазе Aiming: в проверке кадра ничего не тикает.
 */
@Composable
private fun BoxScope.Viewfinder(state: CameraState) {
    val c = Pp.colors
    val m = Pp.motion
    val aiming = state.phase == CameraState.Phase.Aiming
    val snap = remember { Animatable(1f) }
    LaunchedEffect(state.phase) {
        if (state.phase == CameraState.Phase.Review) { snap.snapTo(0f); snap.animateTo(1f, tween(m.grow, easing = m.easeOut)) }
    }
    val frameColor = if (aiming) c.detect.frame else c.status.ok.solid
    val dim = c.surface.sunken.copy(alpha = 0.45f)

    Box(
        Modifier.fillMaxSize()
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithCache {
                val w = size.width * 0.78f
                val h = (w * 0.9f).coerceAtMost(size.height * 0.48f)
                val hole = Offset((size.width - w) / 2, (size.height - h) / 2)
                val holeSize = Size(w, h)
                val r = CornerRadius(28.dp.toPx())
                onDrawBehind {
                    drawRect(dim)
                    drawRoundRect(Color.Black, hole, holeSize, r, blendMode = BlendMode.DstOut)
                }
            },
    )
    Box(Modifier.align(Alignment.Center).fillMaxWidth(0.78f).aspectRatio(1f / 0.9f)) {
        if (aiming) AimingLayer(frameColor) else Box(
            Modifier.fillMaxSize().detectionCorners(frameColor, arm = 34.dp, stroke = 4.dp, progress = { snap.value }, snapFrom = m.snapScale),
        )
    }
}

@Composable
private fun AimingLayer(frameColor: Color) {
    val c = Pp.colors
    val m = Pp.motion
    val loop = rememberInfiniteTransition()
    val scan = loop.animateFloat(0f, 1f, infiniteRepeatable(tween(2200, easing = LinearEasing), RepeatMode.Reverse))
    val breathe = loop.animateFloat(1.04f, 1f, infiniteRepeatable(tween(1400, easing = m.easeInOut), RepeatMode.Reverse))
    val scanColor = c.accent.scan
    Box(
        Modifier.fillMaxSize()
            .graphicsLayer { scaleX = breathe.value; scaleY = breathe.value }
            .detectionCorners(frameColor, arm = 34.dp, stroke = 4.dp)
            .padding(14.dp)
            .drawWithCache {
                // кисти — один раз на размер; кадр анимации только сдвигает их
                val line = Brush.horizontalGradient(listOf(Color.Transparent, scanColor, Color.Transparent))
                val trailH = 60.dp.toPx()
                val trail = Brush.verticalGradient(listOf(Color.Transparent, scanColor.copy(alpha = 0.10f)), startY = 0f, endY = trailH)
                val stroke = 2.dp.toPx()
                onDrawBehind {
                    val y = size.height * scan.value
                    translate(top = y - trailH) { drawRect(trail, size = Size(size.width, trailH)) }
                    drawLine(line, Offset(0f, y), Offset(size.width, y), stroke, StrokeCap.Round)
                }
            },
    )
}

@Composable
private fun ShutterRow(state: CameraState, accept: (CameraIntent) -> Unit) {
    Row(
        Modifier.fillMaxWidth().widthIn(max = 520.dp).padding(bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        ShotStack(state, onSelect = { accept(CameraIntent.SelectStep(it)) })
        Shutter(enabled = state.phase == CameraState.Phase.Aiming) { accept(CameraIntent.ShutterPressed) }
        StageBadge(state.stage)
    }
}

/** Затвор-знак. Нажатие: уголки сжимаются к точке (transform), отпускание — снимок. */
@Composable
private fun Shutter(enabled: Boolean, onClick: () -> Unit) {
    val c = Pp.colors
    val m = Pp.motion
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val squeeze = remember { Animatable(0f) }
    LaunchedEffect(pressed) { squeeze.animateTo(if (pressed) 1f else 0f, tween(if (pressed) m.press else m.release, easing = m.easeOut)) }
    val size = Pp.sizes.shutter
    Box(
        Modifier.size(size).clip(Pp.radii.pill)
            .background(c.surface.sunken.copy(alpha = 0.5f))
            .border(2.dp, c.onMedia.copy(alpha = 0.85f), Pp.radii.pill)
            .clickable(source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(size * 0.62f)) {
            val k = squeeze.value
            val inset = size.toPx() * 0.04f + k * 6.dp.toPx()
            val arm = 12.dp.toPx() * (1f - 0.3f * k)
            val w = 3.5.dp.toPx()
            val l = inset; val t = inset; val r = this.size.width - inset; val b = this.size.height - inset
            for (i in 0 until 4) {
                val x = if (i == 0 || i == 3) l else r; val y = if (i < 2) t else b
                val dx = if (x == l) arm else -arm; val dy = if (y == t) arm else -arm
                drawLine(c.onMedia, Offset(x, y), Offset(x + dx, y), w, StrokeCap.Round)
                drawLine(c.onMedia, Offset(x, y), Offset(x, y + dy), w, StrokeCap.Round)
            }
            drawCircle(c.accent.scan, radius = this.size.minDimension * (0.16f + 0.06f * k))
        }
    }
}

/** Стопка снятых кадров: каждый следующий ложится с небольшим поворотом. */
@Composable
private fun ShotStack(state: CameraState, onSelect: (CaptureStep) -> Unit) {
    val c = Pp.colors
    val stackBrush = remember(c) { Brush.linearGradient(listOf(c.surface.overlay, c.accent.subtleHover)) }
    Box(Modifier.size(Pp.sizes.cameraControl + 8.dp), contentAlignment = Alignment.Center) {
        val shots = state.steps.filter { it in state.shots }
        if (shots.isEmpty()) {
            Box(Modifier.size(Pp.sizes.cameraControl).clip(Pp.radii.card).border(1.5.dp, c.onMedia.copy(alpha = 0.35f), Pp.radii.card))
        }
        shots.forEachIndexed { i, step ->
            key(step) {
                Box(
                    Modifier.size(Pp.sizes.cameraControl)
                        .appearPop()
                        .graphicsLayer { rotationZ = (i - shots.size + 1) * 8f }
                        .clip(Pp.radii.card)
                        .background(stackBrush)
                        .border(1.5.dp, c.onMedia.copy(alpha = 0.9f), Pp.radii.card)
                        .clickable { onSelect(step) },
                    contentAlignment = Alignment.Center,
                ) { PpText((state.steps.indexOf(step) + 1).toString(), style = Pp.type.label, color = c.onMedia) }
            }
        }
    }
}

/** Новый кадр «ложится» в стопку: из 1.6 к 1 с проявлением, только в слое. */
@Composable
private fun Modifier.appearPop(): Modifier {
    val p = remember { Animatable(0f) }
    val m = Pp.motion
    LaunchedEffect(Unit) { p.animateTo(1f, tween(m.slow, easing = m.easeOut)) }
    return graphicsLayer {
        val s = 1.6f - 0.6f * p.value
        scaleX = s; scaleY = s; alpha = p.value
    }
}

@Composable
private fun StageBadge(stage: PhotoStage) {
    // капсула по содержимому: подпись не упирается в края ни на каком шрифте
    Glass(Modifier.defaultMinSize(minWidth = Pp.sizes.cameraControl + 8.dp, minHeight = Pp.sizes.cameraControl + 8.dp)) {
        Column(
            Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            PpText(stage.title.uppercase(), style = Pp.type.micro, color = Pp.colors.onMedia, maxLines = 1)
            PpText("ремонта", style = Pp.type.caption, color = Pp.colors.onMediaMuted, maxLines = 1)
        }
    }
}

@Composable
private fun ReviewBar(accept: (CameraIntent) -> Unit) {
    Glass(Modifier.fillMaxWidth().widthIn(max = 520.dp)) {
        PpActionBar(Modifier.padding(10.dp), spacing = 10.dp) {
            PpButton("Переснять", { accept(CameraIntent.Retake) }, variant = PpButtonVariant.Secondary, size = PpButtonSize.Lg, leading = PpIcons.Close, shape = Pp.radii.pill)
            PpButton("Кадр принят", { accept(CameraIntent.Accept) }, variant = PpButtonVariant.Scan, size = PpButtonSize.Lg, leading = PpIcons.Check, shape = Pp.radii.pill)
        }
    }
}

@Composable
private fun SummaryBar(state: CameraState, accept: (CameraIntent) -> Unit) {
    val c = Pp.colors
    Glass(Modifier.fillMaxWidth().widthIn(max = 520.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PpText("Съёмка «${state.stage.title.lowercase()}» готова", style = Pp.type.title, color = c.onMedia)
            state.steps.forEach { s ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PpIcon(PpIcons.Check, size = 16.dp, tint = c.status.ok.solid)
                    PpText(s.title, style = Pp.type.bodySm, color = c.onMedia, modifier = Modifier.weight(1f))
                    state.shots[s]?.let { PpText(it.takenAtMillis.formatDayTime(), style = Pp.type.monoSm, color = c.onMediaMuted) }
                }
            }
            PpButton("Прикрепить к наряду", { accept(CameraIntent.Finish) }, Modifier.fillMaxWidth(), PpButtonVariant.Primary, PpButtonSize.Lg, trailing = PpIcons.ArrowRight, shape = Pp.radii.pill)
        }
    }
}

@Composable
private fun PermissionGate(forever: Boolean, onRequest: () -> Unit, onSettings: () -> Unit, onClose: () -> Unit) {
    val c = Pp.colors
    Column(
        Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Box(Modifier.size(120.dp).detectionCorners(c.accent.scan, arm = 24.dp, stroke = 3.dp), contentAlignment = Alignment.Center) {
            PpIcon(PpIcons.Camera, size = 44.dp, tint = c.text.secondary)
        }
        PpText("Нужен доступ к камере", style = Pp.type.h3)
        PpText(
            if (forever) "Доступ выключен в настройках. Без кадров «до» и «после» наряд не закрыть."
            else "Кадры «до» и «после» подтверждают ремонт. Снимаем только объект наряда.",
            style = Pp.type.bodySm, color = c.text.muted,
        )
        PpActionBar(Modifier.widthIn(max = 420.dp)) {
            PpButton("Не сейчас", onClose, variant = PpButtonVariant.Ghost, size = PpButtonSize.Lg, shape = Pp.radii.pill)
            PpButton(if (forever) "Открыть настройки" else "Разрешить", if (forever) onSettings else onRequest, shape = Pp.radii.pill, size = PpButtonSize.Lg)
        }
    }
}

/** Стеклянная капсула поверх кадра: полупрозрачный navy + тонкая светлая линия. */
@Composable
private fun Glass(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val c = Pp.colors
    Box(
        modifier.clip(Pp.radii.dialog).background(c.surface.sunken.copy(alpha = 0.55f))
            .border(1.dp, c.onMedia.copy(alpha = 0.14f), Pp.radii.dialog),
    ) { content() }
}
