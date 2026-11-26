package ru.poputno.common.data.local

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import ru.poputno.common.domain.model.Brigade
import ru.poputno.common.domain.model.DefectClass
import ru.poputno.common.domain.model.EvidencePhoto
import ru.poputno.common.domain.model.GeoPoint
import ru.poputno.common.domain.model.InfraObject
import ru.poputno.common.domain.model.ObjectKind
import ru.poputno.common.domain.model.Severity
import ru.poputno.common.domain.model.WorkOrder
import ru.poputno.common.domain.model.WorkOrderStatus
import ru.poputno.common.domain.repository.BrigadeRepository
import ru.poputno.common.domain.repository.Clock
import ru.poputno.common.domain.repository.WorkOrderRepository
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome

/**
 * Наряды и бригады живут на клиенте, пока в API нет эндпоинтов (права work_orders_* уже есть).
 * Состояние одно на процесс: наряд руководителя сразу виден бригаде на этом же устройстве.
 */
internal class LocalWorkOrderRepository(private val clock: Clock) : WorkOrderRepository {
    private var seq = 312
    private val orders = MutableStateFlow(seed(clock.nowMillis()))

    override fun all(): Flow<List<WorkOrder>> = orders
    override fun forBrigade(brigadeId: String) = orders.map { l -> l.filter { it.brigadeId == brigadeId } }
    override fun byId(id: String) = orders.map { l -> l.firstOrNull { it.id == id } }

    override suspend fun createFrom(obj: InfraObject): Outcome<WorkOrder> {
        val defect = obj.defect ?: return Outcome.Fail(AppError.Validation("defect", "У объекта нет дефекта"))
        if (orders.value.any { it.objectId == obj.id && it.status != WorkOrderStatus.Verified }) {
            return Outcome.Fail(AppError.Validation("object", "На объект уже есть наряд"))
        }
        val now = clock.nowMillis()
        val severity = obj.severity ?: Severity.Medium
        val order = WorkOrder(
            id = "WO-" + (seq++).toString().padStart(4, '0'),
            objectId = obj.id, kind = obj.kind, address = obj.address, defect = defect, severity = severity,
            status = WorkOrderStatus.Draft, brigadeId = null, createdAtMillis = now,
            dueAtMillis = now + if (severity >= Severity.High) 2 * HOUR else 24 * HOUR,
            point = obj.point,
        )
        orders.update { listOf(order) + it }
        return Outcome.Ok(order)
    }

    override suspend fun assign(orderId: String, brigadeId: String) = edit(orderId) { it.copy(brigadeId = brigadeId, status = WorkOrderStatus.Assigned) }
    override suspend fun setStatus(orderId: String, status: WorkOrderStatus) = edit(orderId) { it.copy(status = status) }
    override suspend fun attachPhoto(orderId: String, photo: EvidencePhoto) = edit(orderId) { o ->
        o.copy(photos = o.photos.filterNot { it.stage == photo.stage && it.step == photo.step } + photo)
    }

    private fun edit(id: String, f: (WorkOrder) -> WorkOrder): Outcome<Unit> {
        if (orders.value.none { it.id == id }) return Outcome.Fail(AppError.Validation("order", "Наряд не найден"))
        orders.update { l -> l.map { if (it.id == id) f(it) else it } }
        return Outcome.Ok(Unit)
    }

    private companion object {
        const val HOUR = 3_600_000L
        val mount = DefectClass("mount_failure", "Нарушение крепления", "Срочный выезд бригады: восстановить крепление, оградить место")
        val deformation = DefectClass("deformation", "Механическое повреждение", "Ремонт: выправить или заменить корпус, дверь, климатический отсек")
        val paint = DefectClass("paint", "Повреждение ЛКП", "Плановое ТО: зачистить коррозию и восстановить ЛКП")

        // координаты демо-нарядов — реальные адреса Лефортово (ул. Авиамоторная, ш. Энтузиастов…)
        fun seed(now: Long) = listOf(
            WorkOrder("WO-0311", "ТКШ-26224137", ObjectKind.Tksh, "ул. Авиамоторная, 8", mount, Severity.Critical, WorkOrderStatus.Assigned, BrigadeIds.B07, now - 40 * 60_000, now + 2 * HOUR, point = GeoPoint(55.7519, 37.7171)),
            WorkOrder("WO-0309", "РЩ-20118842", ObjectKind.Rsh, "Шоссе Энтузиастов, 21", deformation, Severity.High, WorkOrderStatus.InProgress, BrigadeIds.B07, now - 3 * HOUR, now + HOUR, point = GeoPoint(55.7546, 37.7357)),
            WorkOrder("WO-0305", "ТКШ-26220511", ObjectKind.Tksh, "Танковый пр., 4", paint, Severity.Medium, WorkOrderStatus.Assigned, BrigadeIds.B12, now - 5 * HOUR, now + 6 * HOUR, point = GeoPoint(55.7553, 37.7124)),
            WorkOrder("WO-0298", "РЩ-20110093", ObjectKind.Rsh, "ул. Солдатская, 6", paint, Severity.Low, WorkOrderStatus.Done, BrigadeIds.B12, now - 26 * HOUR, now - 2 * HOUR, point = GeoPoint(55.7641, 37.7095)),
        )
    }
}

/** Пока бригады не приходят с сервера, пользователь-техник привязан к бригаде 7. */
object BrigadeIds {
    const val B07 = "B-07"
    const val B12 = "B-12"
    const val DEFAULT_FOR_TECHNICIAN = B07
}

internal class LocalBrigadeRepository : BrigadeRepository {
    private val brigades = MutableStateFlow(
        listOf(
            Brigade(BrigadeIds.B07, "Бригада 7", listOf("Петров", "Ахмедов"), "А 123 ВС 777", 2, true),
            Brigade(BrigadeIds.B12, "Бригада 12", listOf("Смирнова", "Ким"), "О 456 КХ 799", 1, true),
            Brigade("B-03", "Бригада 3", listOf("Волков", "Гусев"), "Е 789 МР 750", 0, false),
        ),
    )
    override fun brigades(): Flow<List<Brigade>> = brigades
}
