// Drone3D for DJI Avata 1/2 (and any drone flown with DJI Fly): a phone-only plugin.
// It captures the DJI Fly screen, runs the Python reconstruction on the phone (Chaquopy),
// and shows the live 3D model in a floating window on top of DJI Fly. No DJI SDK, no computer.
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.chaquo.python")
}

android {
    namespace = "com.drone3d.avata"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.drone3d.avata"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += listOf("arm64-v8a") }   // add "x86_64" to run in an emulator
    }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { viewBinding = true }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/drone3dAssets"))
}

// The reconstruction engine (Python) and the 3D viewer (HTML) are shared with the desktop server.
val copyEngine by tasks.registering(Copy::class) {
    from("../../server/drone3d") { exclude("__pycache__/**", "server.py") }
    into(layout.buildDirectory.dir("generated/drone3dPython/drone3d"))
}
val copyViewer by tasks.registering(Copy::class) {
    from("../../server/viewer")
    into(layout.buildDirectory.dir("generated/drone3dAssets/viewer"))
}
tasks.named("preBuild") { dependsOn(copyEngine, copyViewer) }
tasks.matching { it.name != "copyEngine" && it.name != "copyViewer" &&
    (it.name.contains("Python", ignoreCase = true) || it.name.contains("Assets")) }
    .configureEach { dependsOn(copyEngine, copyViewer) }

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

chaquopy {
    defaultConfig {
        version = "3.10"
        // Chaquopy needs a Python 3.10 on the build computer (e.g. "py -3.10" on Windows, python3.10 elsewhere)
        localProps.getProperty("chaquopy.buildPython")?.let { buildPython(*it.split(" ").toTypedArray()) }
        pip {
            // versions published for Android by Chaquopy (scipy 1.8 needs numpy < 1.25)
            install("numpy==1.23.3")
            install("scipy==1.8.1")
            install("opencv-python==4.5.1.48")
        }
    }
    sourceSets {
        getByName("main") { srcDir(layout.buildDirectory.dir("generated/drone3dPython")) }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.webkit:webkit:1.10.0")
    implementation("com.google.mlkit:text-recognition:16.0.1")   // on-device OCR of the DJI Fly height
}
