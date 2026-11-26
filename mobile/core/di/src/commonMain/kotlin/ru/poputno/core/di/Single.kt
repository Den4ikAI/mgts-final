package ru.poputno.core.di

import kotlin.properties.PropertyDelegateProvider
import kotlin.properties.ReadOnlyProperty
import kotlin.reflect.KProperty

/**
 * Единственный экземпляр на граф: значение создаётся при первом обращении и переиспользуется.
 *
 * Отличие от `lazy` — детектор циклов: если инициализатор прямо или через другие `single`
 * возвращается к себе же, бросается [GraphCycleException] с именем поля вместо
 * `StackOverflowError` глубоко в стеке. Проверка гарантирована на JVM (реентерабельный
 * монитор `lazy`); на Native цикл проявится зависанием, поэтому графы прогоняются smoke-тестом
 * на desktop. Неудавшаяся инициализация не кэшируется — следующее обращение повторит её.
 */
fun <T> single(initializer: () -> T): PropertyDelegateProvider<Any, ReadOnlyProperty<Any, T>> =
    PropertyDelegateProvider { owner, property ->
        Single(label = "${owner::class.simpleName}.${property.name}", initializer = initializer, onInit = null)
    }

/**
 * [single], чей экземпляр граф закрывает сам: [onClose] вызывается из [ClosableGraph.close]
 * только если значение успело создаться, в порядке, обратном инициализации. После закрытия
 * графа не созданное значение больше не создаётся — обращение падает до вызова [initializer].
 */
fun <T> single(
    onClose: (T) -> Unit,
    initializer: () -> T,
): PropertyDelegateProvider<ClosableGraph, ReadOnlyProperty<Any, T>> =
    PropertyDelegateProvider { owner, property ->
        Single(
            label = "${owner::class.simpleName}.${property.name}",
            initializer = {
                owner.checkOpen()
                initializer()
            },
            onInit = { value -> owner.own { onClose(value) } },
        )
    }

/** Новый экземпляр на каждое обращение; нужен там, где объект живёт короче графа. */
fun <T> factory(create: () -> T): ReadOnlyProperty<Any, T> = ReadOnlyProperty { _, _ -> create() }

class GraphCycleException(label: String) : IllegalStateException(
    "Cyclic dependency: $label is requested while it is being initialized",
)

private class Single<T>(
    private val label: String,
    initializer: () -> T,
    onInit: ((T) -> Unit)?,
) : ReadOnlyProperty<Any, T> {
    private var initializing = false
    private val value: T by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        if (initializing) throw GraphCycleException(label)
        initializing = true
        try {
            initializer().also { onInit?.invoke(it) }
        } finally {
            initializing = false
        }
    }

    override fun getValue(thisRef: Any, property: KProperty<*>): T = value
}
