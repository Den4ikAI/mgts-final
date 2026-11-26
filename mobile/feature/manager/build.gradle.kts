plugins { id("poputno.kmp.feature") }

kotlin {
    sourceSets {
        commonMain.dependencies { implementation(project(":common:map")) }
    }
}
