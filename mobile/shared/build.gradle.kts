// Корень приложения: граф зависимостей, RootComponent (Decompose), App().
plugins { id("poputno.kmp.feature") }

kotlin {
    listOf(iosArm64(), iosSimulatorArm64()).forEach {
        it.binaries.framework {
            baseName = "Poputno"
            isStatic = true
        }
    }
    sourceSets {
        named("desktopTest").dependencies { implementation(libs.kotlin.test); implementation(libs.kotlin.reflect) }
        commonMain.dependencies {
            api(project(":core:designsystem"))
            api(libs.decompose)
            api(libs.essenty.lifecycle)
            api(project(":core:di"))
            api(project(":common:domain"))
            implementation(project(":common:data"))
            implementation(project(":core:permissions"))
            implementation(project(":core:network"))
            implementation(libs.coil.compose)
            implementation(libs.coil.network.ktor)
            implementation(project(":common:camera"))
            implementation(project(":feature:auth"))
            implementation(project(":feature:brigade"))
            implementation(project(":feature:dispatcher"))
            implementation(project(":feature:manager"))
            implementation(project(":feature:admin"))
        }
    }
}
