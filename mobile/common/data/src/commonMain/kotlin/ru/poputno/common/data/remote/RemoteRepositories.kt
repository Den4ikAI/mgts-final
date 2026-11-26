package ru.poputno.common.data.remote

import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonPrimitive
import ru.poputno.common.data.platform.readFileBytes
import ru.poputno.common.domain.model.DefectClass
import ru.poputno.common.domain.model.Detection
import ru.poputno.common.domain.model.GeoPoint
import ru.poputno.common.domain.model.InfraObject
import ru.poputno.common.domain.model.ObjectStatus
import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Session
import ru.poputno.common.domain.model.User
import ru.poputno.common.domain.model.Verdict
import ru.poputno.common.domain.repository.AuthRepository
import ru.poputno.common.domain.repository.DetectionRepository
import ru.poputno.common.domain.repository.FrameRepository
import ru.poputno.common.domain.repository.ObjectRepository
import ru.poputno.common.domain.repository.TaxonomyRepository
import ru.poputno.common.domain.repository.UserRepository
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome
import ru.poputno.core.common.map
import ru.poputno.core.network.ApiClient
import ru.poputno.core.network.apiCall
import ru.poputno.core.network.encodePath

internal class RemoteAuthRepository(private val api: ApiClient) : AuthRepository {
    private val state = MutableStateFlow<Session?>(null)
    override val session: StateFlow<Session?> = state.asStateFlow()
    override val serverUrl: StateFlow<String> get() = api.config.baseUrl
    override fun setServerUrl(url: String) = api.config.set(url)

    override suspend fun login(login: String, password: String): Outcome<Session> {
        val r = apiCall<TokenResponseDto> {
            api.http.post("api/auth/login") {
                contentType(ContentType.Application.Json)
                setBody(LoginBody(login.trim(), password))
            }
        }
        return when (r) {
            is Outcome.Fail -> Outcome.Fail(
                if (r.error == AppError.Unauthorized) AppError.Validation("password", "Неверный логин или пароль") else r.error,
            )
            is Outcome.Ok -> {
                val user = r.value.user.toDomain()
                    ?: return Outcome.Fail(AppError.Validation("login", "Роль «${r.value.user.role}» не поддерживается приложением"))
                api.setAccessToken(r.value.accessToken)
                Outcome.Ok(Session(user).also { state.value = it })
            }
        }
    }

    /** Сессия истекла (refresh отклонён): клиент возвращается на вход. */
    fun expire() {
        api.setAccessToken(null)
        state.value = null
    }

    override suspend fun logout() {
        apiCall<Unit> { api.http.post("api/auth/logout") { contentType(ContentType.Application.Json); setBody("{}") } }
        api.setAccessToken(null)
        state.value = null
    }
}

internal class RemoteTaxonomyRepository(private val api: ApiClient) : TaxonomyRepository {
    private val lock = Mutex()
    private var cache: Map<String, DefectClass>? = null

    override suspend fun classes(): Map<String, DefectClass> = lock.withLock {
        cache ?: when (val r = apiCall<TaxonomyDto> { api.http.get("api/taxonomy") }) {
            // таксономия не критична: без неё подписи берутся из запасного словаря, кэш не ставим
            is Outcome.Fail -> emptyMap()
            is Outcome.Ok -> r.value.classes.mapValues { (k, v) -> DefectClass(k, v.label ?: k, v.action, v.ok) }.also { cache = it }
        }
    }

    fun clear() { cache = null }
}

internal class RemoteDetectionRepository(
    private val api: ApiClient,
    private val taxonomy: TaxonomyRepository,
) : DetectionRepository {
    private val state = MutableStateFlow<List<Detection>?>(null)
    override val queue: StateFlow<List<Detection>?> = state.asStateFlow()

    override suspend fun refresh(): Outcome<Unit> {
        val tax = taxonomy.classes()
        return apiCall<List<DetectionDto>> { api.http.get("api/queue") }.map { list ->
            state.value = list.map { it.toDomain(tax, api.config::mediaUrl) }
        }
    }

    override suspend fun review(detection: Detection, verdict: Verdict, comment: String?): Outcome<Unit> {
        val objectId = detection.objectId
            ?: return Outcome.Fail(AppError.Validation("object", "У срабатывания нет объекта: решение не сохранить"))
        val body = when (verdict) {
            Verdict.Confirm -> ReviewRequestDto("confirm", detection.id, comment = comment)
            Verdict.NeedRecapture -> ReviewRequestDto("need_recapture", detection.id, comment = comment)
            is Verdict.Reject -> ReviewRequestDto("reject", detection.id, JsonPrimitive(verdict.reason.key), comment)
        }
        // оптимистично убираем из очереди; при ошибке возвращаем на место
        val before = state.value
        state.update { it?.filterNot { d -> d.id == detection.id } }
        val r = apiCall<Unit> {
            api.http.post("api/objects/${encodePath(objectId)}/reviews") {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }
        if (r is Outcome.Fail) state.value = before
        return r
    }

    fun clear() { state.value = null }
}

internal class RemoteObjectRepository(private val api: ApiClient, private val taxonomy: TaxonomyRepository) : ObjectRepository {
    override suspend fun objects(status: ObjectStatus?): Outcome<List<InfraObject>> {
        val tax = taxonomy.classes()
        return apiCall<List<ObjectDto>> {
            api.http.get("api/objects") { status?.let { parameter("status", it.key) } }
        }.map { list -> list.map { it.toDomain(tax) } }
    }
}

internal class RemoteFrameRepository(private val api: ApiClient) : FrameRepository {
    override suspend fun upload(localPath: String, objectId: String?, point: GeoPoint?): Outcome<String> {
        val bytes = readFileBytes(localPath)
            ?: return Outcome.Fail(AppError.Validation("file", "Файл кадра недоступен"))
        val name = localPath.substringAfterLast('/')
        return apiCall<List<AcceptedDto>> {
            api.http.submitFormWithBinaryData(
                url = "api/frames",
                formData = formData {
                    append("files", bytes, Headers.build {
                        append(HttpHeaders.ContentType, "image/jpeg")
                        append(HttpHeaders.ContentDisposition, "filename=\"$name\"")
                    })
                    objectId?.let { append("object_id", it) }
                    point?.let { append("lat", it.lat.toString()); append("lon", it.lon.toString()) }
                },
            )
        }.map { it.first().frameId }
    }
}

internal class RemoteUserRepository(private val api: ApiClient) : UserRepository {
    override suspend fun users(): Outcome<List<User>> =
        apiCall<List<UserDto>> { api.http.get("api/users") }.map { l -> l.mapNotNull { it.toDomain() } }

    override suspend fun changeRole(userId: String, role: Role): Outcome<User> =
        apiCall<UserDto> {
            api.http.patch("api/users/$userId") {
                contentType(ContentType.Application.Json)
                setBody(UpdateUserDto(role = role.key))
            }
        }.let { r ->
            when (r) {
                is Outcome.Fail -> r
                is Outcome.Ok -> r.value.toDomain()?.let { Outcome.Ok(it) } ?: Outcome.Fail(AppError.Unknown("role"))
            }
        }
}
