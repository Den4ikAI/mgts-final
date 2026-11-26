package ru.poputno.common.data.di

import ru.poputno.common.data.local.LocalBrigadeRepository
import ru.poputno.common.data.local.LocalWorkOrderRepository
import ru.poputno.common.data.remote.RemoteAuthRepository
import ru.poputno.common.data.remote.RemoteDetectionRepository
import ru.poputno.common.data.remote.RemoteFrameRepository
import ru.poputno.common.data.remote.RemoteObjectRepository
import ru.poputno.common.data.remote.RemoteTaxonomyRepository
import ru.poputno.common.data.remote.RemoteUserRepository
import ru.poputno.common.domain.repository.AuthRepository
import ru.poputno.common.domain.repository.BrigadeRepository
import ru.poputno.common.domain.repository.Clock
import ru.poputno.common.domain.repository.DetectionRepository
import ru.poputno.common.domain.repository.FrameRepository
import ru.poputno.common.domain.repository.ObjectRepository
import ru.poputno.common.domain.repository.TaxonomyRepository
import ru.poputno.common.domain.repository.UserRepository
import ru.poputno.common.domain.repository.WorkOrderRepository
import ru.poputno.core.di.ClosableGraph
import ru.poputno.core.di.LogoutCleaner
import ru.poputno.core.di.single
import ru.poputno.core.network.ApiClient
import ru.poputno.core.network.ServerConfig

/**
 * Граф данных уровня процесса. Наружу — только доменные интерфейсы, реализации internal:
 * фича не может зависеть от источника данных. HTTP-клиент один на процесс (пул соединений,
 * cookie refresh), его же использует загрузчик картинок.
 */
class DataGraph(val clock: Clock, serverConfig: ServerConfig = ServerConfig()) : ClosableGraph() {
    private val auth by single { RemoteAuthRepository(api) }

    val api: ApiClient by single(onClose = ApiClient::close) {
        ApiClient(serverConfig, onSessionExpired = { auth.expire() })
    }

    private val taxonomy by single { RemoteTaxonomyRepository(api) }
    private val detections by single { RemoteDetectionRepository(api, taxonomy) }

    val authRepository: AuthRepository get() = auth
    val taxonomyRepository: TaxonomyRepository get() = taxonomy
    val detectionRepository: DetectionRepository get() = detections
    val objectRepository: ObjectRepository by single { RemoteObjectRepository(api, taxonomy) }
    val frameRepository: FrameRepository by single { RemoteFrameRepository(api) }
    val userRepository: UserRepository by single { RemoteUserRepository(api) }
    val workOrderRepository: WorkOrderRepository by single { LocalWorkOrderRepository(clock) }
    val brigadeRepository: BrigadeRepository by single { LocalBrigadeRepository() }

    /** Кэши, принадлежащие сессии: очередь и таксономия другого пользователя не должны протечь. */
    val sessionCleaner = LogoutCleaner {
        detections.clear()
        taxonomy.clear()
    }
}
