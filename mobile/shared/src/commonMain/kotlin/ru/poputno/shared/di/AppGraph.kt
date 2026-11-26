package ru.poputno.shared.di

import ru.poputno.common.data.di.DataGraph
import ru.poputno.common.data.local.BrigadeIds
import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.Session
import ru.poputno.common.domain.repository.AuthRepository
import ru.poputno.common.domain.repository.BrigadeRepository
import ru.poputno.common.domain.repository.Clock
import ru.poputno.common.domain.repository.DetectionRepository
import ru.poputno.common.domain.repository.FrameRepository
import ru.poputno.common.domain.repository.ObjectRepository
import ru.poputno.common.domain.repository.UserRepository
import ru.poputno.common.domain.repository.WorkOrderRepository
import ru.poputno.core.di.ClosableGraph
import ru.poputno.core.di.SessionContributions
import ru.poputno.core.di.SessionContributor
import ru.poputno.core.di.sessionContributionsOf
import ru.poputno.core.di.single
import ru.poputno.feature.admin.di.AdminDeps
import ru.poputno.feature.admin.di.AdminGraph
import ru.poputno.feature.auth.di.AuthDeps
import ru.poputno.feature.auth.di.AuthGraph
import ru.poputno.feature.brigade.di.BrigadeDeps
import ru.poputno.feature.brigade.di.BrigadeGraph
import ru.poputno.feature.dispatcher.di.DispatcherDeps
import ru.poputno.feature.dispatcher.di.DispatcherGraph
import ru.poputno.feature.manager.di.ManagerDeps
import ru.poputno.feature.manager.di.ManagerGraph
import kotlin.reflect.KProperty1

/** Граф процесса: данные и вход. Живёт, пока живёт приложение. */
class AppGraph(clock: Clock) : ClosableGraph() {
    val data by single(onClose = DataGraph::close) { DataGraph(clock) }
    val authRepository: AuthRepository get() = data.authRepository

    /**
     * Зависимость берётся ДО создания AuthGraph: data материализуется раньше и, значит,
     * закрывается позже (обратный порядок) — зависимый граф не переживает свой источник.
     */
    val auth by single(onClose = AuthGraph::close) {
        val repo = data.authRepository
        AuthGraph(object : AuthDeps { override val authRepository = repo })
    }

    fun openSession(session: Session) = SessionGraph(data, session)
}

/**
 * Граф одной сессии. Фичи получают только свой Deps-интерфейс (его реализует этот граф),
 * графы фич создаются лениво — роль «Бригада» не создаёт граф диспетчера.
 * На logout: клинеры созданных [SessionContributor] + кэши данных → close() графа.
 */
class SessionGraph(private val data: DataGraph, val session: Session) :
    ClosableGraph(), DispatcherDeps, ManagerDeps, BrigadeDeps, AdminDeps {

    override val detectionRepository: DetectionRepository get() = data.detectionRepository
    override val objectRepository: ObjectRepository get() = data.objectRepository
    override val workOrderRepository: WorkOrderRepository get() = data.workOrderRepository
    override val brigadeRepository: BrigadeRepository get() = data.brigadeRepository
    override val frameRepository: FrameRepository get() = data.frameRepository
    override val userRepository: UserRepository get() = data.userRepository
    override val clock: Clock get() = data.clock

    /** Какие графы фич реально созданы в этой сессии. Пишется только из single-инициализаторов. */
    private val created = HashSet<String>()

    val dispatcher: DispatcherGraph by single(onClose = DispatcherGraph::close) { created += SessionGraph::dispatcher.name; DispatcherGraph(this) }
    val manager by single(onClose = ManagerGraph::close) { ManagerGraph(this) }
    val brigade: BrigadeGraph by single(onClose = BrigadeGraph::close) { created += SessionGraph::brigade.name; BrigadeGraph(this) }
    val admin by single(onClose = AdminGraph::close) { AdminGraph(this) }

    /**
     * Бригада пользователя-техника. В API бригад пока нет — все техники стенда в бригаде 7.
     * Когда появится `/api/brigades`, значение придёт из профиля.
     */
    val brigadeId: String get() {
        check(session.user.role == Role.Brigade) { "brigadeId только для роли «Бригада»" }
        return session.user.brigadeId ?: BrigadeIds.DEFAULT_FOR_TECHNICIAN
    }

    /** Все графы с сессионным состоянием. Полноту списка проверяет SessionGraphTest. */
    val contributors: List<KProperty1<SessionGraph, SessionContributor>> =
        listOf(SessionGraph::dispatcher, SessionGraph::brigade)

    /** Вклады только созданных графов: logout не создаёт граф роли, которой не было. */
    fun contributions(): SessionContributions {
        val features = sessionContributionsOf(contributors.filter { it.name in created })
        return SessionContributions(
            logoutCleaners = features.logoutCleaners + data.sessionCleaner,
            prefetchers = features.prefetchers,
        )
    }
}
