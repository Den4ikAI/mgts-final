package ru.poputno.common.data.remote

import ru.poputno.common.domain.model.BBox
import ru.poputno.common.domain.model.DefectClass
import ru.poputno.common.domain.model.Detection
import ru.poputno.common.domain.model.GeoPoint
import ru.poputno.common.domain.model.InfraObject
import ru.poputno.common.domain.model.ObjectKind
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.common.domain.model.ReviewState
import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Severity
import ru.poputno.common.domain.model.User
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
internal fun parseInstant(iso: String?): Long? = iso?.let { runCatching { Instant.parse(it).toEpochMilliseconds() }.getOrNull() }

internal fun UserDto.toDomain(): User? = Role.fromKey(role)?.let { User(id, displayName, login, it, active) }

/**
 * Ключ класса → DefectClass. Сначала таксономия сервера, затем запасные подписи для ключей,
 * которых в таксономии нет (старые сцены с люками и опорами), и только потом сам ключ.
 */
internal fun defectOf(key: String?, taxonomy: Map<String, DefectClass>): DefectClass? {
    if (key == null) return null
    return taxonomy[key] ?: FALLBACK_LABELS[key]?.let { DefectClass(key, it) } ?: DefectClass(key, key.replace('_', ' '))
}

private val FALLBACK_LABELS = mapOf(
    "open_hatch" to "Открытый люк",
    "pole_tilt" to "Наклон опоры",
    "cable_sag" to "Провис кабеля",
    "paved_over" to "Закатан в асфальт",
    "subsidence" to "Просадка",
)

private fun point(lat: Double?, lon: Double?) = if (lat != null && lon != null) GeoPoint(lat, lon) else null

internal fun DetectionDto.toDomain(taxonomy: Map<String, DefectClass>, mediaUrl: (String) -> String) = Detection(
    id = id,
    frameId = frameId,
    objectId = objectId,
    kind = ObjectKind.fromKey(objectKind),
    defect = defectOf(defectType, taxonomy),
    severity = Severity.fromKey(severity),
    confidence = confidence,
    bbox = BBox(bbox.x, bbox.y, bbox.w, bbox.h),
    photoUrl = cropUri?.let(mediaUrl),
    rationale = rationale,
    point = point(lat, lon),
    reviewState = when (reviewState) {
        "confirmed" -> ReviewState.Confirmed
        "rejected" -> ReviewState.Rejected
        "need_recapture" -> ReviewState.NeedRecapture
        "auto" -> ReviewState.Auto
        else -> ReviewState.Pending
    },
    createdAtMillis = parseInstant(createdAt) ?: 0L,
)


internal fun ObjectDto.toDomain(taxonomy: Map<String, DefectClass>) = InfraObject(
    id = id,
    kind = ObjectKind.fromKey(kind),
    address = address,
    point = point(lat, lon),
    status = ObjectStatus.fromKey(status),
    defect = defectOf(lastDefectType, taxonomy),
    severity = Severity.fromKey(maxSeverity),
    lastSeenAtMillis = parseInstant(lastSeenAt),
)
