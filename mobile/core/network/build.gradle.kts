// HTTP-клиент к API «Попутно»: Ktor, bearer + ротируемый refresh (cookie mgts_refresh), JSON snake_case.
plugins {
    id("poputno.kmp.library")
    id("org.jetbrains.kotlin.plugin.serialization")
}

kotlin {
    sourceSets {
        commonMain.dependencies {
            api(libs.ktor.client.core)
            implementation(libs.ktor.client.auth)
            implementation(libs.ktor.client.logging)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.json)
            api(libs.serialization.json)
            api(project(":core:common"))
        }
        androidMain.dependencies { implementation(libs.ktor.client.okhttp) }
        named("desktopMain").dependencies { implementation(libs.ktor.client.okhttp) }
        iosMain.dependencies { implementation(libs.ktor.client.darwin) }
        commonTest.dependencies { implementation(libs.ktor.client.mock) }
    }
}
