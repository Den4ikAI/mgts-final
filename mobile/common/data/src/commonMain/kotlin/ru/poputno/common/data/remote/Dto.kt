package ru.poputno.common.data.remote

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/*
 * DTO по OpenAPI (mobile/api/openapi.json, `GET /api/openapi.json`).
 * Имена полей — camelCase, JSON — snake_case (ApiJson.namingStrategy).
 * Неизвестные поля игнорируются: сервер может расширять схему, клиент не падает.
 */

@Serializable internal data class LoginBody(val login: String, val password: String)

@Serializable internal data class UserDto(
    val id: String,
    val login: String,
    val displayName: String,
    val role: String,
    val active: Boolean = true,
)

@Serializable internal data class TokenResponseDto(val accessToken: String, val expiresIn: Long, val user: UserDto)

@Serializable internal data class BBoxDto(val x: Float, val y: Float, val w: Float, val h: Float)

@Serializable internal data class DetectionDto(
    val id: String,
    val frameId: String,
    val objectId: String? = null,
    val objectKind: String,
    val defectType: String? = null,
    val severity: String? = null,
    val confidence: Double,
    val bbox: BBoxDto,
    val cropUri: String? = null,
    val rationale: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val reviewState: String,
    val createdAt: String,
)


@Serializable internal data class ReviewRequestDto(
    val decision: String,
    val detectionId: String? = null,
    /** Строка ("shadow") или объект {"other": "..."} — см. RejectReason в схеме. */
    val rejectReason: JsonElement? = null,
    val comment: String? = null,
)

@Serializable internal data class ObjectDto(
    val id: String,
    val kind: String,
    val status: String,
    val address: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val lastDefectType: String? = null,
    val maxSeverity: String? = null,
    val lastSeenAt: String? = null,
)

@Serializable internal data class TaxonomyDto(val classes: Map<String, TaxonomyClassDto> = emptyMap())

@Serializable internal data class TaxonomyClassDto(val label: String? = null, val action: String? = null, val ok: Boolean = false)

@Serializable internal data class AcceptedDto(val frameId: String, val mediaUri: String, val duplicate: Boolean)

@Serializable internal data class UpdateUserDto(val role: String? = null)

