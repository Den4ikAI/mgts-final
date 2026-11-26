package ru.poputno.common.ui.mapping

import androidx.compose.ui.graphics.vector.ImageVector
import ru.poputno.common.domain.model.ObjectKind
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.core.designsystem.components.PpStatus
import ru.poputno.core.designsystem.icons.PpIcons

fun ObjectStatus.toUi(): PpStatus = when (this) {
    ObjectStatus.Ok -> PpStatus.Ok
    ObjectStatus.Suspected -> PpStatus.Suspected
    ObjectStatus.Defect -> PpStatus.Defect
    ObjectStatus.Critical -> PpStatus.Critical
    ObjectStatus.NotObserved -> PpStatus.NotObserved
}

val ObjectKind.icon: ImageVector get() = when (this) {
    ObjectKind.Tksh, ObjectKind.Rsh -> PpIcons.Cabinet
    ObjectKind.CableWell -> PpIcons.Manhole
    ObjectKind.DualPole -> PpIcons.Pole
    ObjectKind.Other -> PpIcons.Frame
}
