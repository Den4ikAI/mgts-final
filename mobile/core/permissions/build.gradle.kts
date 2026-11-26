// Разрешения рантайма (сейчас камера). Общий контракт + платформенные реализации.
plugins { id("poputno.kmp.compose") }

kotlin {
    sourceSets {
        commonMain.dependencies { implementation(libs.lifecycle.runtime.compose) }
        androidMain.dependencies { implementation(libs.activity.compose) }
    }
}
