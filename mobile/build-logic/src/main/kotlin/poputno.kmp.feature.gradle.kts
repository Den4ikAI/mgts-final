// Фича-модуль: Compose + Decompose + MVI + дизайн-система + домен.
plugins {
    id("poputno.kmp.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val catalog = extensions.getByType<VersionCatalogsExtension>().named("libs")

kotlin {
    sourceSets {
        commonMain.dependencies {
            implementation(project(":core:common"))
            implementation(project(":core:di"))
            implementation(project(":core:mvi"))
            implementation(project(":core:designsystem"))
            implementation(project(":common:domain"))
            implementation(project(":common:ui"))
            implementation(catalog.findLibrary("decompose").get())
            implementation(catalog.findLibrary("decompose-compose").get())
            implementation(catalog.findLibrary("essenty-lifecycle-coroutines").get())
            implementation(catalog.findLibrary("serialization-json").get())
        }
    }
}
