import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.compose)
    alias(libs.plugins.kotlin.compose)
}

kotlin {
    jvmToolchain(21)
    jvm()
    sourceSets {
        jvmMain.dependencies {
            implementation(project(":shared"))
            // только для tools/Snapshots
            implementation(project(":feature:auth"))
            implementation(project(":feature:brigade"))
            implementation(project(":feature:dispatcher"))
            implementation(project(":common:domain"))
            implementation(compose.desktop.currentOs)
            implementation(libs.coroutines.swing)
            implementation(libs.decompose)
            implementation(libs.decompose.compose)
        }
    }
}

compose.desktop {
    application {
        mainClass = "ru.poputno.desktop.MainKt"
        nativeDistributions {
            targetFormats(TargetFormat.Deb, TargetFormat.Dmg, TargetFormat.Msi)
            packageName = "Poputno"
            packageVersion = "1.0.0"
            // иконка пакета — из бренда (design2/brand/logo/icon-512.png)
            linux { iconFile.set(project.file("icons/poputno.png")) }
        }
    }
}

// Headless-скриншоты всех ролей на трёх ширинах (проверка адаптива без дисплея)
tasks.register<JavaExec>("snapshots") {
    dependsOn("jvmMainClasses")
    val jvm = kotlin.jvm()
    classpath = files(jvm.compilations["main"].output.allOutputs, jvm.compilations["main"].runtimeDependencyFiles)
    mainClass.set("ru.poputno.desktop.tools.SnapshotsKt")
    args(project.findProperty("out")?.toString() ?: layout.buildDirectory.dir("snapshots").get().asFile.absolutePath)
    systemProperty("java.awt.headless", "true")
}
