package ru.poputno.common.camera.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import ru.poputno.common.domain.model.EvidencePhoto
import ru.poputno.common.domain.model.PhotoStage
import ru.poputno.common.domain.repository.Clock
import ru.poputno.core.mvi.retainedStore

/** Камера как компонент Decompose: открывается поверх стека бригады анимацией sheetRise. */
class CameraComponent(
    context: ComponentContext,
    title: String,
    subtitle: String,
    stage: PhotoStage,
    clock: Clock,
    private val onFinished: (List<EvidencePhoto>) -> Unit,
    private val onClosed: () -> Unit,
) : ComponentContext by context {
    private val store = retainedStore { CameraStore(title, subtitle, stage, clock) }
    val state: StateFlow<CameraState> = store.state
    fun accept(intent: CameraIntent) = store.accept(intent)

    init {
        coroutineScope().launch {
            store.labels.collect {
                when (it) {
                    is CameraLabel.Finished -> onFinished(it.photos)
                    CameraLabel.Closed -> onClosed()
                }
            }
        }
    }
}
