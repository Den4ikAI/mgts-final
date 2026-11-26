plugins { id("poputno.kmp.library") }

kotlin {
    sourceSets {
        commonMain.dependencies {
            api(libs.essenty.lifecycle)
            api(libs.essenty.instancekeeper)
            implementation(libs.essenty.lifecycle.coroutines)
        }
    }
}

kotlin {
    sourceSets {
        androidMain.dependencies { implementation(libs.coroutines.android) }
    }
}
