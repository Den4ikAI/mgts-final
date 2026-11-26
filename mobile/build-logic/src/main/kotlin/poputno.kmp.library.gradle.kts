// Базовая KMP-библиотека: Android + Desktop (JVM) + iOS.
// Namespace Android выводится из пути модуля: :feature:brigade -> ru.poputno.feature.brigade
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.kotlin.multiplatform.library")
}

val catalog = extensions.getByType<VersionCatalogsExtension>().named("libs")
fun v(name: String) = catalog.findVersion(name).get().requiredVersion

kotlin {
    jvmToolchain(21)

    android {
        namespace = "ru.poputno" + project.path.replace(":", ".").replace("-", "")
        compileSdk = v("android-compileSdk").toInt()
        minSdk = v("android-minSdk").toInt()
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
        androidResources { enable = true }
    }
    jvm("desktop")
    iosArm64()
    iosSimulatorArm64()

    compilerOptions {
        freeCompilerArgs.addAll("-Xexpect-actual-classes")
    }

    sourceSets {
        commonMain.dependencies {
            implementation(catalog.findLibrary("coroutines-core").get())
        }
        commonTest.dependencies {
            implementation(catalog.findLibrary("kotlin-test").get())
            implementation(catalog.findLibrary("coroutines-test").get())
        }
    }
}
