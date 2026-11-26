// Камера бригады: общий UI и флоу в commonMain, превью кадра через expect/actual.
plugins { id("poputno.kmp.feature") }

kotlin {
    sourceSets {
        commonMain.dependencies { implementation(project(":core:permissions")) }
        androidMain.dependencies {
            implementation(libs.camerax.core)
            implementation(libs.camerax.camera2)
            implementation(libs.camerax.lifecycle)
            implementation(libs.camerax.view)
            implementation(libs.activity.compose)
        }
    }
}
