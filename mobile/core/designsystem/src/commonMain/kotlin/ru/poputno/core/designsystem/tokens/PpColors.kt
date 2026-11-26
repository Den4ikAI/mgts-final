package ru.poputno.core.designsystem.tokens

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import ru.poputno.core.designsystem.tokens.PpPalette.Critical
import ru.poputno.core.designsystem.tokens.PpPalette.Defect
import ru.poputno.core.designsystem.tokens.PpPalette.Navy
import ru.poputno.core.designsystem.tokens.PpPalette.Ok
import ru.poputno.core.designsystem.tokens.PpPalette.Scan
import ru.poputno.core.designsystem.tokens.PpPalette.Signal
import ru.poputno.core.designsystem.tokens.PpPalette.Slate
import ru.poputno.core.designsystem.tokens.PpPalette.Suspected

/**
 * Слой 2. Семантика. Тёмная тема основная (диспетчерская, проектор), светлая — бригада днём.
 * Светлая тема не инвертирует палитру, а переназначает роли.
 */
@Immutable
data class PpColors(
    val isDark: Boolean,
    val surface: Surface,
    val text: Text,
    val border: Border,
    val accent: Accent,
    val action: Action,
    val focusRing: Color,
    val status: StatusSet,
    val severity: Severity,
    val detect: Detect,
    val provenance: Provenance,
    val route: Route,
    val chart: Chart,
    val logo: Logo,
    val onMedia: Color = Slate.s50,
    val onMediaMuted: Color = Slate.s50.copy(alpha = 0.72f),
    val shadow: Color,
) {
    @Immutable data class Surface(
        val sunken: Color, val base: Color, val raised: Color, val raisedHover: Color,
        val overlay: Color, val inverse: Color, val selected: Color, val skeleton: Color, val scrim: Color,
    )
    @Immutable data class Text(
        val primary: Color, val secondary: Color, val muted: Color, val disabled: Color,
        val inverse: Color, val accent: Color, val link: Color, val onAccent: Color, val onScan: Color,
        val danger: Color,
    )
    @Immutable data class Border(val subtle: Color, val default: Color, val strong: Color, val accent: Color)
    @Immutable data class Accent(
        val base: Color, val strong: Color, val subtle: Color, val subtleHover: Color, val fg: Color,
        val scan: Color, val scanSubtle: Color,
    )
    @Immutable data class Action(
        val primary: Color, val primaryHover: Color, val primaryPress: Color,
        val secondary: Color, val secondaryHover: Color, val secondaryPress: Color, val secondaryFg: Color,
        val ghostHover: Color, val ghostPress: Color,
        val danger: Color, val dangerHover: Color, val dangerPress: Color, val disabled: Color,
    )
    /** Тройка статуса: icon (иконка, точка), fg (текст), bg/border (пилюля), solid (метка на карте). */
    @Immutable data class StatusColors(val icon: Color, val fg: Color, val bg: Color, val border: Color, val solid: Color)
    @Immutable data class StatusSet(
        val ok: StatusColors, val suspected: StatusColors, val defect: StatusColors,
        val critical: StatusColors, val notObserved: StatusColors, val onSolid: Color,
    )
    @Immutable data class Severity(val low: Color, val medium: Color, val high: Color, val critical: Color, val track: Color)
    @Immutable data class Detect(val frame: Color, val defect: Color, val tagBg: Color, val tagFg: Color, val shadow: Color)
    @Immutable data class Provenance(val model: Color, val modelFg: Color, val modelBg: Color, val human: Color, val humanBg: Color)
    @Immutable data class Route(val line: Color, val track: Color, val node: Color)
    @Immutable data class Chart(val series: Color, val series2: Color, val accent: Color, val grid: Color, val axis: Color, val label: Color)
    @Immutable data class Logo(val mark: Color, val dot: Color, val word: Color)

    companion object {
        private val slateA = Slate.s300
        private val navyA = Navy.s900

        val Dark = PpColors(
            isDark = true,
            surface = Surface(
                sunken = Navy.s1000, base = Navy.s950, raised = Navy.s900, raisedHover = Navy.s850,
                overlay = Navy.s800, inverse = Slate.s50, selected = Signal.s500.copy(alpha = 0.16f),
                skeleton = Navy.s850, scrim = Navy.s1000.copy(alpha = 0.66f),
            ),
            text = Text(
                primary = Slate.s50, secondary = Slate.s300, muted = Slate.s400, disabled = Slate.s600,
                inverse = Navy.s950, accent = Signal.s300, link = Signal.s300, onAccent = Slate.s0,
                onScan = Navy.s950, danger = Critical.s300,
            ),
            border = Border(slateA.copy(alpha = 0.10f), slateA.copy(alpha = 0.18f), slateA.copy(alpha = 0.34f), Signal.s500),
            accent = Accent(
                base = Signal.s500, strong = Signal.s400, subtle = Signal.s500.copy(alpha = 0.14f),
                subtleHover = Signal.s500.copy(alpha = 0.22f), fg = Signal.s200,
                scan = Scan.s400, scanSubtle = Scan.s400.copy(alpha = 0.12f),
            ),
            action = Action(
                primary = Signal.s600, primaryHover = Signal.s550, primaryPress = Signal.s700,
                secondary = slateA.copy(alpha = 0.10f), secondaryHover = slateA.copy(alpha = 0.16f),
                secondaryPress = slateA.copy(alpha = 0.22f), secondaryFg = Slate.s50,
                ghostHover = slateA.copy(alpha = 0.08f), ghostPress = slateA.copy(alpha = 0.14f),
                danger = Critical.s600, dangerHover = Critical.s550, dangerPress = Critical.s700,
                disabled = Navy.s850,
            ),
            focusRing = Scan.s400,
            status = StatusSet(
                ok = StatusColors(Ok.s400, Ok.s300, Ok.s500.copy(alpha = 0.14f), Ok.s400.copy(alpha = 0.38f), Ok.s500),
                suspected = StatusColors(Suspected.s400, Suspected.s300, Suspected.s500.copy(alpha = 0.13f), Suspected.s400.copy(alpha = 0.38f), Suspected.s500),
                defect = StatusColors(Defect.s400, Defect.s300, Defect.s500.copy(alpha = 0.15f), Defect.s400.copy(alpha = 0.42f), Defect.s500),
                critical = StatusColors(Critical.s400, Critical.s300, Critical.s500.copy(alpha = 0.16f), Critical.s400.copy(alpha = 0.48f), Critical.s500),
                notObserved = StatusColors(Slate.s400, Slate.s300, Slate.s400.copy(alpha = 0.08f), Slate.s500, Slate.s400),
                onSolid = Navy.s950,
            ),
            severity = Severity(Suspected.s400, Defect.s400, Critical.s400, Critical.s500, slateA.copy(alpha = 0.18f)),
            detect = Detect(Scan.s400, Defect.s400, Scan.s400, Navy.s950, Navy.s1000.copy(alpha = 0.55f)),
            provenance = Provenance(Scan.s400, Scan.s300, Scan.s400.copy(alpha = 0.10f), Slate.s50, slateA.copy(alpha = 0.12f)),
            route = Route(Signal.s500, slateA.copy(alpha = 0.16f), Navy.s950),
            chart = Chart(Slate.s600, Slate.s700, Signal.s400, slateA.copy(alpha = 0.10f), slateA.copy(alpha = 0.28f), Slate.s400),
            logo = Logo(Signal.s500, Scan.s400, Slate.s25),
            shadow = Color(0xA3010610),
        )

        val Light = PpColors(
            isDark = false,
            surface = Surface(
                sunken = Slate.s50, base = Slate.s25, raised = Slate.s0, raisedHover = Slate.s25,
                overlay = Slate.s0, inverse = Navy.s900, selected = Signal.s50, skeleton = Slate.s100,
                scrim = navyA.copy(alpha = 0.40f),
            ),
            text = Text(
                primary = Navy.s900, secondary = Slate.s700, muted = Slate.s600, disabled = Slate.s400,
                inverse = Slate.s25, accent = Signal.s600, link = Signal.s600, onAccent = Slate.s0,
                onScan = Slate.s0, danger = Critical.s700,
            ),
            border = Border(navyA.copy(alpha = 0.08f), navyA.copy(alpha = 0.14f), navyA.copy(alpha = 0.28f), Signal.s600),
            accent = Accent(
                base = Signal.s600, strong = Signal.s700, subtle = Signal.s50, subtleHover = Signal.s100,
                fg = Signal.s700, scan = Scan.s700, scanSubtle = Scan.s50,
            ),
            action = Action(
                primary = Signal.s600, primaryHover = Signal.s700, primaryPress = Signal.s800,
                secondary = Slate.s0, secondaryHover = Slate.s25, secondaryPress = Slate.s50, secondaryFg = Navy.s900,
                ghostHover = navyA.copy(alpha = 0.05f), ghostPress = navyA.copy(alpha = 0.09f),
                danger = Critical.s600, dangerHover = Critical.s700, dangerPress = Critical.s800,
                disabled = Slate.s100,
            ),
            focusRing = Signal.s600,
            status = StatusSet(
                ok = StatusColors(Ok.s600, Ok.s700, Ok.s50, Ok.s200, Ok.s500),
                suspected = StatusColors(Suspected.s600, Suspected.s700, Suspected.s50, Suspected.s200, Suspected.s500),
                defect = StatusColors(Defect.s600, Defect.s700, Defect.s50, Defect.s200, Defect.s500),
                critical = StatusColors(Critical.s600, Critical.s700, Critical.s50, Critical.s200, Critical.s500),
                notObserved = StatusColors(Slate.s500, Slate.s600, Slate.s25, Slate.s500, Slate.s400),
                onSolid = Navy.s950,
            ),
            severity = Severity(Suspected.s600, Defect.s600, Critical.s500, Critical.s700, navyA.copy(alpha = 0.12f)),
            detect = Detect(Scan.s400, Defect.s400, Scan.s400, Navy.s950, Navy.s1000.copy(alpha = 0.55f)),
            provenance = Provenance(Scan.s600, Scan.s800, Scan.s50, Navy.s900, Slate.s50),
            route = Route(Signal.s600, navyA.copy(alpha = 0.12f), Slate.s0),
            chart = Chart(Slate.s300, Slate.s200, Signal.s600, navyA.copy(alpha = 0.07f), navyA.copy(alpha = 0.24f), Slate.s600),
            logo = Logo(Signal.s600, Scan.s600, Navy.s900),
            shadow = Color(0x29061A2E),
        )
    }
}
