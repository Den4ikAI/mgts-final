package ru.poputno.feature.admin.di

import ru.poputno.common.domain.repository.UserRepository
import ru.poputno.core.di.ClosableGraph
import ru.poputno.core.di.factory
import ru.poputno.feature.admin.domain.ChangeRoleUseCase
import ru.poputno.feature.admin.domain.LoadUsersUseCase

interface AdminDeps {
    val userRepository: UserRepository
}

class AdminGraph(private val deps: AdminDeps) : ClosableGraph() {
    val loadUsers by factory { LoadUsersUseCase(deps.userRepository) }
    val changeRole by factory { ChangeRoleUseCase(deps.userRepository) }
}
