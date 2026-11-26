package ru.poputno.common.domain.model

import kotlinx.serialization.Serializable

/** Роли совпадают с бэкендом (docs/auth.md): admin / dispatcher / manager / technician. */
@Serializable
enum class Role(val key: String, val title: String) {
    /** Управляет системой: пользователи и роли. */
    Admin("admin", "Администратор"),
    /** Вручную разбирает кадры, которые модель отправила на проверку. */
    Dispatcher("dispatcher", "Диспетчер"),
    /** Связывает диспетчера и бригады: собирает наряды, назначает, принимает работу. */
    Manager("manager", "Руководитель"),
    /** Бригада: выезжает на объект, снимает до/после, закрывает наряд. */
    Brigade("technician", "Бригада");

    companion object {
        fun fromKey(key: String): Role? = entries.firstOrNull { it.key == key }
    }
}

@Serializable
data class User(
    val id: String,
    val name: String,
    val login: String,
    val role: Role,
    val active: Boolean = true,
    val brigadeId: String? = null,
)

data class Session(val user: User)

/** Тип объекта — ключ таксономии сервера. Неизвестный ключ не ломает клиент. */
enum class ObjectKind(val key: String, val title: String) {
    Tksh("tksh", "ТКШ"),
    Rsh("rsh", "РЩ"),
    CableWell("cable_well", "Колодец"),
    DualPole("dual_pole", "Опора"),
    Other("", "Объект");

    companion object {
        fun fromKey(key: String?): ObjectKind = entries.firstOrNull { it.key == key && it != Other } ?: Other
    }
}

/** Состояние объекта. «Не наблюдается» отдельно от «Нормы»: честное «не видно». */
enum class ObjectStatus(val key: String) {
    Ok("ok"), Suspected("suspected"), Defect("defect"), Critical("critical"), NotObserved("not_observed");

    companion object {
        fun fromKey(key: String?): ObjectStatus = entries.firstOrNull { it.key == key } ?: Suspected
    }
}

enum class Severity(val key: String, val level: Int, val title: String) {
    Low("low", 1, "Низкая"), Medium("medium", 2, "Средняя"), High("high", 3, "Высокая"), Critical("critical", 4, "Критичная");

    companion object {
        fun fromKey(key: String?): Severity? = entries.firstOrNull { it.key == key }
    }
}

/**
 * Класс дефекта из таксономии сервера (`GET /api/taxonomy`): ключ, подпись и рекомендация
 * бригаде. Ключи меняются вместе с моделью, поэтому это не enum.
 */
data class DefectClass(val key: String, val title: String, val action: String? = null, val isOk: Boolean = false)

/** Нормализованная рамка детекции в долях кадра [0, 1]. */
data class BBox(val x: Float, val y: Float, val w: Float, val h: Float) {
    /** Рамка на весь кадр несёт ноль информации — её не рисуем. */
    val isWholeFrame: Boolean get() = w >= 0.95f && h >= 0.95f
}

data class GeoPoint(val lat: Double, val lon: Double)


data class InfraObject(
    val id: String,
    val kind: ObjectKind,
    val address: String?,
    val point: GeoPoint?,
    val status: ObjectStatus,
    val defect: DefectClass?,
    val severity: Severity?,
    val lastSeenAtMillis: Long?,
)

enum class ReviewState { Pending, Confirmed, Rejected, NeedRecapture, Auto }

/** Срабатывание модели по одному кадру. Кадр — доказательство, единица анализа — объект. */
data class Detection(
    val id: String,
    val frameId: String,
    val objectId: String?,
    val kind: ObjectKind,
    val defect: DefectClass?,
    val severity: Severity?,
    val confidence: Double,
    val bbox: BBox,
    /** Полный адрес фото (`<сервер>/api/media/...`), требует Bearer. Собирает слой данных. */
    val photoUrl: String?,
    val rationale: String?,
    val point: GeoPoint?,
    val reviewState: ReviewState,
    val createdAtMillis: Long,
) {
    val status: ObjectStatus get() = when {
        severity == Severity.Critical -> ObjectStatus.Critical
        defect == null -> ObjectStatus.NotObserved
        defect.isOk -> ObjectStatus.Ok
        else -> ObjectStatus.Defect
    }
}

/** Причины отказа совпадают с API: они же — метки для дообучения модели. */
enum class RejectReason(val key: String, val title: String) {
    NotADefect("not_a_defect", "Не дефект"),
    Shadow("shadow", "Тень"),
    Puddle("puddle", "Лужа"),
    ForeignOwner("foreign_owner", "Чужой объект"),
    BadFrame("bad_frame", "Плохой кадр"),
}

/** Решение диспетчера по срабатыванию. */
sealed interface Verdict {
    data object Confirm : Verdict
    data class Reject(val reason: RejectReason) : Verdict
    data object NeedRecapture : Verdict
}

enum class WorkOrderStatus(val title: String) {
    Draft("Черновик"), Assigned("Назначен"), EnRoute("В пути"), InProgress("На объекте"),
    Done("Выполнен"), Verified("Подтверждён проездом"),
}

enum class PhotoStage(val title: String) { Before("До"), After("После") }

/** Шаги съёмки бригады: обязательный набор кадров, чтобы подтвердить ремонт. */
enum class CaptureStep(val title: String, val hint: String) {
    Overview("Общий план", "Объект целиком и ориентир рядом"),
    CloseUp("Крупно", "Дефект или место ремонта в рамке"),
    Plate("Номер", "Табличка с ID объекта"),
}

/** Кадр бригады. [frameId] появляется после выгрузки на сервер (`POST /api/frames`). */
data class EvidencePhoto(
    val id: String,
    val stage: PhotoStage,
    val step: CaptureStep,
    val localPath: String,
    val takenAtMillis: Long,
    val frameId: String? = null,
)

data class WorkOrder(
    val id: String,
    val objectId: String,
    val kind: ObjectKind,
    val address: String?,
    val defect: DefectClass,
    val severity: Severity,
    val status: WorkOrderStatus,
    val brigadeId: String?,
    val createdAtMillis: Long,
    val dueAtMillis: Long,
    val photos: List<EvidencePhoto> = emptyList(),
    /** Где объект: из реестра (если сервер знает координаты) — для карты и маршрута бригады. */
    val point: GeoPoint? = null,
)

data class Brigade(val id: String, val name: String, val members: List<String>, val vehicle: String, val activeOrders: Int, val onShift: Boolean)
