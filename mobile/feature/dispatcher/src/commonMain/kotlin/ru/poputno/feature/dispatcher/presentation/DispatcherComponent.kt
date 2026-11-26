package ru.poputno.feature.dispatcher.presentation

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.lifecycle.coroutines.coroutineScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import ru.poputno.core.mvi.retainedStore
import ru.poputno.feature.dispatcher.di.DispatcherGraph

class DispatcherComponent(context: ComponentContext, graph: DispatcherGraph) : ComponentContext by context {
    private val store = retainedStore { DispatcherStore(graph) }
    val state: StateFlow<DispatcherState> = store.state
    fun accept(i: DispatcherIntent) = store.accept(i)

    /** На телефоне деталь открыта поверх списка: системное «назад» закрывает её, а не приложение. */
    private val closeDetail = BackCallback(isEnabled = false) { store.accept(DispatcherIntent.Select(null)) }
    private var overlayMode = true

    /** Экран сообщает раскладку: в режиме «список + деталь» назад детали не закрывает. */
    fun setOverlayMode(overlay: Boolean) {
        overlayMode = overlay
        closeDetail.isEnabled = overlay && state.value.selectedId != null
    }

    init {
        backHandler.register(closeDetail)
        coroutineScope().launch { state.collect { closeDetail.isEnabled = overlayMode && it.selectedId != null } }
    }
}
