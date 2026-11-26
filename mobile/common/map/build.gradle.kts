// Карта: Яндекс MapKit на Android, схема объектов на desktop/iOS (MapKit для iOS — CocoaPods, только macOS).
plugins { id("poputno.kmp.compose") }

kotlin {
    sourceSets {
        commonMain.dependencies {
            api(project(":core:designsystem"))
            api(project(":common:domain"))
        }
        androidMain.dependencies { implementation(libs.yandex.mapkit) }
    }
}
