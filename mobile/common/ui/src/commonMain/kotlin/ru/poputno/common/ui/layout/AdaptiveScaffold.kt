package ru.poputno.common.ui.layout

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.poputno.core.designsystem.Pp
import ru.poputno.core.designsystem.components.PpBadge
import ru.poputno.core.designsystem.components.PpLogo
import ru.poputno.core.designsystem.components.PpMark
import ru.poputno.core.designsystem.foundation.PpIcon
import ru.poputno.core.designsystem.foundation.PpText
import ru.poputno.core.designsystem.tokens.PpWidthClass

data class NavItem(val key: String, val title: String, val icon: ImageVector, val badge: Int? = null)

/**
 * Каркас роли. Раскладка выбирается по классу ширины окна, а не по платформе:
 *  Compact  — плавающий «док»-капсула снизу (не Material bottom bar);
 *  Medium   — узкий rail слева, знак сверху;
 *  Expanded+ — сайдбар с логотипом, подписями и карточкой пользователя.
 *
 * Дерево ОДНО для всех вариантов: навигация условно добавляется рядом, а [content] всегда
 * вызывается из одного места. Поэтому смена класса (поворот, складной экран, ресайз) и
 * полноэкранный режим камеры [immersive] не пересоздают экран: стек, скролл и анимации живы.
 */
@Composable
fun RoleScaffold(
    items: List<NavItem>,
    selected: String,
    onSelect: (String) -> Unit,
    userName: String,
    roleTitle: String,
    onLogout: () -> Unit,
    immersive: Boolean = false,
    content: @Composable () -> Unit,
) {
    val wc = Pp.adaptive.widthClass
    val c = Pp.colors
    val showDock = !immersive && wc == PpWidthClass.Compact
    Box(
        Modifier.fillMaxSize()
            .background(if (immersive) c.surface.sunken else c.surface.base)
            .then(if (immersive) Modifier else Modifier.windowInsetsPadding(WindowInsets.safeDrawing)),
    ) {
        Row(Modifier.fillMaxSize()) {
            if (!immersive && wc == PpWidthClass.Medium) Rail(items, selected, onSelect, onLogout)
            if (!immersive && wc >= PpWidthClass.Expanded) Sidebar(items, selected, onSelect, userName, roleTitle, onLogout)
            Box(
                Modifier.weight(1f).fillMaxHeight().padding(bottom = if (showDock) 88.dp else 0.dp),
                contentAlignment = Alignment.TopCenter,
            ) {
                Box(Modifier.widthIn(max = if (immersive) Dp.Unspecified else Pp.sizes.contentMax).fillMaxSize()) { content() }
            }
        }
        if (showDock) Dock(items, selected, onSelect, Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp))
    }
}

/** Плавающий док: капсула, у активного пункта подложка с уголками и подпись. */
@Composable
private fun Dock(items: List<NavItem>, selected: String, onSelect: (String) -> Unit, modifier: Modifier) {
    val c = Pp.colors
    Row(
        modifier.clip(Pp.radii.pill).background(c.surface.overlay).border(1.dp, c.border.default, Pp.radii.pill).padding(6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEach { item ->
            val on = item.key == selected
            // ширина по содержимому: подпись активной вкладки не режется («Пользователи»)
            Row(
                Modifier.animateContentSize(tween(Pp.motion.base, easing = Pp.motion.easeOut))
                    .widthIn(min = 52.dp).height(48.dp).clip(Pp.radii.pill)
                    .background(if (on) c.accent.subtle else Color.Transparent)
                    .clickable(role = Role.Tab) { onSelect(item.key) }
                    .semantics(mergeDescendants = true) { contentDescription = item.title; this.selected = on }
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            ) {
                Box {
                    PpIcon(item.icon, size = 22.dp, tint = if (on) c.accent.fg else c.text.muted)
                    item.badge?.takeIf { it > 0 }?.let {
                        Box(Modifier.offset(12.dp, (-4).dp).size(8.dp).clip(Pp.radii.pill).background(c.accent.scan))
                    }
                }
                if (on) PpText(item.title, style = Pp.type.label, color = c.accent.fg, maxLines = 1)
            }
        }
    }
}

@Composable
private fun Rail(items: List<NavItem>, selected: String, onSelect: (String) -> Unit, onLogout: () -> Unit) {
    val c = Pp.colors
    Column(
        Modifier.width(Pp.sizes.railWidth).fillMaxHeight().background(c.surface.sunken).padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PpMark(size = 32.dp)
        Spacer(Modifier.height(16.dp))
        items.forEach { item ->
            val on = item.key == selected
            Column(
                Modifier.clip(Pp.radii.card).clickable { onSelect(item.key) }.padding(vertical = 6.dp, horizontal = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Box(Modifier.size(52.dp, 32.dp).clip(Pp.radii.pill).background(if (on) c.accent.subtle else Color.Transparent), contentAlignment = Alignment.Center) {
                    PpIcon(item.icon, size = 20.dp, tint = if (on) c.accent.fg else c.text.muted)
                }
                PpText(item.title, style = Pp.type.caption, color = if (on) c.text.primary else c.text.muted, maxLines = 1)
            }
        }
        Spacer(Modifier.weight(1f))
        Box(Modifier.clip(Pp.radii.pill).clickable(onClick = onLogout).padding(10.dp)) {
            PpIcon(ru.poputno.core.designsystem.icons.PpIcons.Close, size = 20.dp, tint = c.text.muted)
        }
    }
}

@Composable
private fun Sidebar(
    items: List<NavItem>, selected: String, onSelect: (String) -> Unit,
    userName: String, roleTitle: String, onLogout: () -> Unit,
) {
    val c = Pp.colors
    Column(
        Modifier.width(Pp.sizes.sidebarWidth).fillMaxHeight().background(c.surface.sunken).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        PpLogo(height = 26.dp, modifier = Modifier.padding(start = 8.dp, top = 4.dp, bottom = 24.dp))
        items.forEach { item ->
            val on = item.key == selected
            Row(
                Modifier.fillMaxWidth().height(44.dp).clip(Pp.radii.control)
                    .background(if (on) c.accent.subtle else Color.Transparent)
                    .clickable { onSelect(item.key) }.padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // активный пункт отмечен «линией маршрута» слева
                Box(Modifier.width(3.dp).height(18.dp).clip(Pp.radii.pill).background(if (on) c.route.line else Color.Transparent))
                PpIcon(item.icon, size = 20.dp, tint = if (on) c.accent.fg else c.text.secondary)
                PpText(item.title, style = Pp.type.bodySm, color = if (on) c.text.primary else c.text.secondary, modifier = Modifier.weight(1f), maxLines = 1)
                item.badge?.takeIf { it > 0 }?.let { PpBadge(it.toString(), accent = on) }
            }
        }
        Spacer(Modifier.weight(1f))
        Column(
            Modifier.fillMaxWidth().clip(Pp.radii.card).background(c.surface.raised).clickable(onClick = onLogout).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            PpText(userName, style = Pp.type.label)
            PpText("$roleTitle · выйти", style = Pp.type.caption, color = c.text.muted)
        }
    }
}

/** Шапка экрана: заголовок Unbounded на широких окнах, Golos на телефоне (правило «от 20 px»).
 * [inset] = false, когда шапка уже внутри контейнера с отступами страницы (сетка, список). */
@Composable
fun ScreenHeader(title: String, subtitle: String? = null, modifier: Modifier = Modifier, inset: Boolean = true, trailing: @Composable () -> Unit = {}) {
    val a = Pp.adaptive
    Row(modifier.fillMaxWidth().padding(horizontal = if (inset) Pp.space.page else 0.dp, vertical = Pp.space.x4), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            PpText(title, style = if (a.atLeastMedium) Pp.type.h2 else Pp.type.h3, maxLines = 1)
            subtitle?.let { PpText(it, style = Pp.type.bodySm, color = Pp.colors.text.muted, maxLines = 1) }
        }
        trailing()
    }
}
