package ru.poputno.feature.admin.domain

import ru.poputno.common.domain.model.Role
import ru.poputno.common.domain.model.User
import ru.poputno.common.domain.repository.UserRepository
import ru.poputno.core.common.AppError
import ru.poputno.core.common.Outcome

class LoadUsersUseCase(private val repo: UserRepository) {
    suspend operator fun invoke(): Outcome<List<User>> = when (val r = repo.users()) {
        is Outcome.Fail -> r
        is Outcome.Ok -> Outcome.Ok(r.value.sortedWith(compareBy<User> { it.role.ordinal }.thenBy { it.name }))
    }
}

class ChangeRoleUseCase(private val repo: UserRepository) {
    /** Последнего активного администратора понизить нельзя: система останется без управления. */
    suspend operator fun invoke(users: List<User>, userId: String, role: Role): Outcome<User> {
        val target = users.firstOrNull { it.id == userId } ?: return Outcome.Fail(AppError.Validation("user", "Пользователь не найден"))
        if (target.role == role) return Outcome.Ok(target)
        val admins = users.count { it.role == Role.Admin && it.active }
        if (target.role == Role.Admin && admins <= 1) {
            return Outcome.Fail(AppError.Validation("role", "Нельзя оставить систему без администратора"))
        }
        return repo.changeRole(userId, role)
    }
}
