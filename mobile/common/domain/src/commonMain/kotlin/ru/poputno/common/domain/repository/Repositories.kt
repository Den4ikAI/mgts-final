package ru.poputno.common.domain.repository

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import ru.poputno.common.domain.model.Brigade
import ru.poputno.common.domain.model.DefectClass
import ru.poputno.common.domain.model.Detection
import ru.poputno.common.domain.model.EvidencePhoto
import ru.poputno.common.domain.model.GeoPoint
import ru.poputno.common.domain.model.InfraObject
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Session
import ru.poputno.common.domain.model.User
import ru.poputno.common.domain.model.Verdict
import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.common.domain.model.WorkOrderStatus
import ru.poputno.core.common.Outcome

/*
 * Контракты данных, общие для ролей. Реализации в :common:data:
 * сервер (OpenAPI, /api/...) — вход, очередь, объекты, таксономия, кадры, пользователи;
 * локально — наряды и бригады (в API их пока нет).
 */

interface AuthRepository {
    val session: StateFlow<Session?>
    /** Адрес сервера, на который идёт вход. */
    val serverUrl: StateFlow<String>
    fun setServerUrl(url: String)
    suspend fun login(login: String, password: String): Outcome<Session>
    suspend fun logout()
}

interface DetectionRepository {
    /** Очередь разбора (pending). Горячий поток: обновляется [refresh] и после решений. */
    val queue: StateFlow<List<Detection>?>
    suspend fun refresh(): Outcome<Unit>
    suspend fun review(detection: Detection, verdict: Verdict, comment: String? = null): Outcome<Unit>
}

interface ObjectRepository {
    suspend fun objects(status: ObjectStatus? = null): Outcome<List<InfraObject>>
}

interface TaxonomyRepository {
    /** Классы дефектов по ключу. Кэшируется на сессию. */
    suspend fun classes(): Map<String, DefectClass>
}

interface FrameRepository {
    /** Выгрузка кадра на анализ (`POST /api/frames`). Возвращает id кадра на сервере. */
    suspend fun upload(localPath: String, objectId: String?, point: GeoPoint? = null): Outcome<String>
}

interface UserRepository {
    suspend fun users(): Outcome<List<User>>
    suspend fun changeRole(userId: String, role: Role): Outcome<User>
}

interface WorkOrderRepository {
    fun all(): Flow<List<WorkOrder>>
    fun forBrigade(brigadeId: String): Flow<List<WorkOrder>>
    fun byId(id: String): Flow<WorkOrder?>
    suspend fun createFrom(obj: InfraObject): Outcome<WorkOrder>
    suspend fun assign(orderId: String, brigadeId: String): Outcome<Unit>
    suspend fun setStatus(orderId: String, status: WorkOrderStatus): Outcome<Unit>
    suspend fun attachPhoto(orderId: String, photo: EvidencePhoto): Outcome<Unit>
}

interface BrigadeRepository {
    fun brigades(): Flow<List<Brigade>>
}

/** Текущее время: инжектится, чтобы тесты и превью были детерминированы. */
fun interface Clock { fun nowMillis(): Long }
