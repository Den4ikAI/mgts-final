pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")
rootProject.name = "poputno"

include(
    // core: инфраструктура без бизнес-смысла
    ":core:common",
    ":core:di",
    ":core:permissions",
    ":core:network",
    ":core:mvi",
    ":core:designsystem",
    // common: доменная модель и данные, общие для всех ролей
    ":common:domain",
    ":common:data",
    ":common:ui",
    ":common:camera",
    ":common:map",
    // feature: экраны по ролям
    ":feature:auth",
    ":feature:brigade",
    ":feature:dispatcher",
    ":feature:manager",
    ":feature:admin",
    // сборка приложения
    ":shared",
    ":androidApp",
    ":desktopApp",
)
