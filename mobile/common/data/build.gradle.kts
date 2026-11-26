// Реализации репозиториев: сервер (Ktor, :core:network) + локальные наряды/бригады,
// которых в API пока нет. Фичи видят только интерфейсы из :common:domain.
plugins {
    id("poputno.kmp.library")
    id("org.jetbrains.kotlin.plugin.serialization")
}

kotlin {
    sourceSets {
        commonMain.dependencies {
            api(project(":common:domain"))
            api(project(":core:di"))
            api(project(":core:network"))
            implementation(libs.serialization.json)
        }
        commonTest.dependencies { implementation(libs.ktor.client.mock) }
    }
}
