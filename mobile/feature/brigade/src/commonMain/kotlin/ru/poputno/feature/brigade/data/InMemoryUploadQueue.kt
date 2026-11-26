package ru.poputno.feature.brigade.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import ru.poputno.common.domain.model.CaptureStep
import ru.poputno.common.domain.model.EvidencePhoto
import ru.poputno.common.domain.model.PhotoStage
import ru.poputno.common.domain.repository.FrameRepository
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome
import ru.poputno.feature.brigade.domain.PhotoUploadQueue

/**
 * Очередь выгрузки в памяти процесса.
 *
 * Ровно ОДИН воркер на всю жизнь очереди: он ждёт сигнал в conflated-канале и выгружает
 * всё, что накопилось. Поэтому параллельные enqueue не могут запустить второй воркер
 * и отправить кадр дважды. Кадры уходят по одному (не забиваем канал 20-мегабайтными
 * файлами параллельно); неудачные остаются до [retry].
 * Переживание смерти процесса — следующий шаг (WorkManager / BGTaskScheduler).
 */
internal class UploadQueue(private val frames: FrameRepository) : PhotoUploadQueue {
    private data class Key(val orderId: String, val stage: PhotoStage, val step: CaptureStep)
    private data class Item(val objectId: String, val photo: EvidencePhoto)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Mutex()
    private val items = LinkedHashMap<Key, Item>()
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private val count = MutableStateFlow(0)
    private val error = MutableStateFlow<String?>(null)

    override val pending: StateFlow<Int> = count.asStateFlow()
    override val lastError: StateFlow<String?> = error.asStateFlow()

    init {
        scope.launch { for (signal in wake) drain() }
    }

    override fun enqueue(orderId: String, objectId: String, photo: EvidencePhoto) {
        scope.launch {
            lock.withLock {
                items[Key(orderId, photo.stage, photo.step)] = Item(objectId, photo)
                count.value = items.size
            }
            wake.trySend(Unit)
        }
    }

    override fun retry() { wake.trySend(Unit) }

    /** Выполняется только воркером: последовательно, без гонок за один и тот же кадр. */
    private suspend fun drain() {
        while (true) {
            val (key, item) = lock.withLock { items.entries.firstOrNull()?.toPair() } ?: return
            when (val r = frames.upload(item.photo.localPath, item.objectId)) {
                is Outcome.Ok -> lock.withLock {
                    // за время выгрузки кадр могли переснять — удаляем только отправленный
                    if (items[key] == item) items.remove(key)
                    count.value = items.size
                    error.value = null
                }
                is Outcome.Fail -> {
                    error.value = when (val e = r.error) {
                        AppError.Network -> "Нет сети: кадры уйдут позже"
                        is AppError.Validation -> e.message
                        else -> "Сервер не принял кадр"
                    }
                    return
                }
            }
        }
    }

    override suspend fun clear() {
        lock.withLock { items.clear(); count.value = 0 }
        error.value = null
    }

    fun close() = scope.cancel()
}
