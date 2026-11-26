package ru.poputno.common.camera.presentation

import androidx.compose.runtime.Immutable
import ru.poputno.common.camera.domain.CaptureSession
import ru.poputno.common.domain.model.CaptureStep
import ru.poputno.common.domain.model.EvidencePhoto
import ru.poputno.common.domain.model.PhotoStage
import ru.poputno.common.domain.repository.Clock
import ru.poputno.core.mvi.MviStore

@Immutable
data class CameraState(
    val title: String,
    val subtitle: String,
    val stage: PhotoStage,
    val steps: List<CaptureStep>,
    val current: CaptureStep,
    val shots: Map<CaptureStep, EvidencePhoto> = emptyMap(),
    val phase: Phase = Phase.Aiming,
    val torch: Boolean = false,
    /** Сообщение под прицелом: снимок не сохранился и т.п. */
    val hint: String? = null,
) {
    enum class Phase { Aiming, Capturing, Review, Summary }
    val currentIndex get() = steps.indexOf(current)
    val pending: EvidencePhoto? get() = shots[current]
}

sealed interface CameraIntent {
    data object ShutterPressed : CameraIntent
    data class Captured(val path: String?) : CameraIntent
    data object Retake : CameraIntent
    data object Accept : CameraIntent
    data class SelectStep(val step: CaptureStep) : CameraIntent
    data object ToggleTorch : CameraIntent
    data object Close : CameraIntent
    data object Finish : CameraIntent
}

sealed interface CameraLabel {
    data class Finished(val photos: List<EvidencePhoto>) : CameraLabel
    data object Closed : CameraLabel
}

class CameraStore(
    title: String,
    subtitle: String,
    stage: PhotoStage,
    private val clock: Clock,
) : MviStore<CameraIntent, CameraState, CameraLabel>(
    CameraState(title, subtitle, stage, CaptureStep.entries, CaptureStep.entries.first()),
) {
    private val session = CaptureSession(stage)
    private var seq = 0

    override fun handle(intent: CameraIntent) {
        when (intent) {
            CameraIntent.ShutterPressed -> if (current.phase == CameraState.Phase.Aiming) reduce { copy(phase = CameraState.Phase.Capturing, hint = null) }
            is CameraIntent.Captured -> {
                val path = intent.path
                if (path == null) {
                    reduce { copy(phase = CameraState.Phase.Aiming, hint = "Кадр не сохранился. Попробуйте ещё раз") }
                } else {
                    val photo = EvidencePhoto("P-${seq++}", current.stage, current.current, path, clock.nowMillis())
                    reduce { copy(shots = shots + (current to photo), phase = CameraState.Phase.Review) }
                }
            }
            CameraIntent.Retake -> reduce { copy(shots = shots - current, phase = CameraState.Phase.Aiming) }
            CameraIntent.Accept -> {
                val next = session.nextAfter(current.current, current.shots.keys)
                reduce {
                    if (next == null) copy(phase = CameraState.Phase.Summary)
                    else copy(current = next, phase = CameraState.Phase.Aiming)
                }
            }
            is CameraIntent.SelectStep -> reduce { copy(current = intent.step, phase = if (intent.step in shots) CameraState.Phase.Review else CameraState.Phase.Aiming) }
            CameraIntent.ToggleTorch -> reduce { copy(torch = !torch) }
            CameraIntent.Close -> publish(CameraLabel.Closed)
            CameraIntent.Finish -> if (current.phase == CameraState.Phase.Summary) {
                // защита от двойного нажатия: после первого Finish экран уже уходит
                reduce { copy(phase = CameraState.Phase.Capturing) }
                publish(CameraLabel.Finished(current.shots.values.toList()))
            }
        }
    }
}
