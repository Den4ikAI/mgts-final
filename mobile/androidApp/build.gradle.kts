import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "ru.poputno.android"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    defaultConfig {
        applicationId = "ru.poputno"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.compileSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
        // ключ Яндекс MapKit: local.properties (yandex.mapkit.key) или env YANDEX_MAPKIT_KEY, не в git
        val local = Properties().apply { rootProject.file("local.properties").takeIf { it.isFile }?.inputStream()?.use(::load) }
        val mapkitKey = local.getProperty("yandex.mapkit.key") ?: System.getenv("YANDEX_MAPKIT_KEY") ?: ""
        buildConfigField("String", "YANDEX_MAPKIT_KEY", "\"$mapkitKey\"")

    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
    // MapKit несёт нативные .so: отдельный APK на ABI — телефон (arm64) не тащит библиотеки эмулятора
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "x86_64")
            isUniversalApk = false
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // стенд: подпись debug-ключом, чтобы ставить на эмулятор/телефон без keystore.
            // Для стора — отдельный signingConfig из переменных окружения.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation(project(":shared"))
    implementation(project(":common:map"))
    implementation(libs.activity.compose)
    implementation(libs.decompose)
}
