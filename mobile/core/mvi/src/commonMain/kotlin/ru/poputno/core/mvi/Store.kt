package ru.poputno.core.mvi

import com.arkivanov.essenty.instancekeeper.InstanceKeeper
import com.arkivanov.essenty.instancekeeper.InstanceKeeperOwner
import com.arkivanov.essenty.instancekeeper.getOrCreate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.coroutines.CoroutineContext

/**
 * MVI: Intent (намерение пользователя) → Store → State (единственный источник истины экрана)
 * + Label (одноразовые события: навигация, тост).
 * State — неизменяемый data class с @Immutable: Compose пропускает рекомпозицию неизменных частей.
 */
interface Store<in Intent : Any, out State : Any, out Label : Any> {
    val state: StateFlow<State>
    val labels: Flow<Label>
    fun accept(intent: Intent)
}

/**
 * База Store. Живёт в InstanceKeeper компонента Decompose: переживает смену конфигурации
 * на Android, уничтожается вместе с компонентом. Reducer синхронный и чистый.
 */
abstract class MviStore<Intent : Any, State : Any, Label : Any>(
    initialState: State,
    context: CoroutineContext = Dispatchers.Main.immediate,
) : Store<Intent, State, Label>, InstanceKeeper.Instance {

    protected val scope: CoroutineScope = CoroutineScope(SupervisorJob() + context)
    private val mutableState = MutableStateFlow(initialState)
    private val labelChannel = Channel<Label>(Channel.BUFFERED)

    final override val state: StateFlow<State> = mutableState.asStateFlow()
    final override val labels: Flow<Label> = labelChannel.receiveAsFlow()

    protected val current: State get() = mutableState.value

    final override fun accept(intent: Intent) = handle(intent)

    protected abstract fun handle(intent: Intent)

    protected fun reduce(reducer: State.() -> State) = mutableState.update(reducer)

    protected fun publish(label: Label) {
        labelChannel.trySend(label)
    }

    protected fun launch(block: suspend CoroutineScope.() -> Unit): Job = scope.launch(block = block)

    override fun onDestroy() {
        scope.cancel()
        labelChannel.close()
    }
}

/**
 * Store, удерживаемый компонентом: `private val store = retainedStore { QueueStore(...) }`.
 * Ключ — класс Store: в одном компоненте один Store каждого типа.
 */
inline fun <reified T : MviStore<*, *, *>> InstanceKeeperOwner.retainedStore(noinline factory: () -> T): T =
    instanceKeeper.getOrCreate(key = T::class, factory = factory)
