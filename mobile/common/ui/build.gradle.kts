// Составные компоненты и движение навигации, общие для фич: переходы стека Decompose,
// появление списков, свайп-действия, адаптивный каркас (bottom bar / rail / sidebar).
plugins { id("poputno.kmp.compose") }

kotlin {
    sourceSets {
        commonMain.dependencies {
            api(project(":core:designsystem"))
            api(project(":common:domain"))
            api(libs.decompose)
            api(libs.decompose.compose)
            implementation(libs.coil.compose)
        }
    }
}
