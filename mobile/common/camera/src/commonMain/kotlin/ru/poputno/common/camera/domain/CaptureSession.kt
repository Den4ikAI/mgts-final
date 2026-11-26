package ru.poputno.common.camera.domain

import ru.poputno.common.domain.model.CaptureStep
import ru.poputno.common.domain.model.EvidencePhoto
import ru.poputno.common.domain.model.PhotoStage

/** Чистая логика сессии съёмки: какие шаги обязательны, какой следующий, готов ли набор. */
class CaptureSession(val stage: PhotoStage, val steps: List<CaptureStep> = CaptureStep.entries) {
    fun nextAfter(step: CaptureStep, done: Set<CaptureStep>): CaptureStep? =
        steps.drop(steps.indexOf(step) + 1).firstOrNull { it !in done } ?: steps.firstOrNull { it !in done }

    fun isComplete(done: Map<CaptureStep, EvidencePhoto>) = steps.all { it in done }
}
