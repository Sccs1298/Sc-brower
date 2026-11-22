import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val djiSdk = "5.20.1"   // DJI Mobile SDK v5 - check developer.dji.com for the latest 5.x

android {
    namespace = "com.drone3d.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.drone3d.app"
        minSdk = 24
        targetSdk = 33
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["DJI_API_KEY"] = localProps.getProperty("DJI_API_KEY", "")
        ndk { abiFilters += listOf("arm64-v8a") }   // DJI MSDK v5 ships arm64 only
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { viewBinding = true }

    // Required by DJI MSDK v5: its native libraries must not be stripped / must be extracted.
    packaging {
        jniLibs {
            useLegacyPackaging = true
            keepDebugSymbols += listOf(
                "*/*/libconstants.so", "*/*/libdji_innertools.so", "*/*/libdjibase.so",
                "*/*/libDJICSDKCommon.so", "*/*/libDJIFlySafeCore-CSDK.so", "*/*/libdjifs_jni-CSDK.so",
                "*/*/libDJIRegister.so", "*/*/libdjisdk_jni.so", "*/*/libDJIUpgradeCore.so",
                "*/*/libDJIUpgradeJNI.so", "*/*/libDJIWaypointV2Core-CSDK.so", "*/*/libdjiwpv2-CSDK.so",
                "*/*/libFlightRecordEngine.so", "*/*/libvideo-framing.so", "*/*/libwaes.so",
                "*/*/libagora-rtsa-sdk.so", "*/*/libc++.so", "*/*/libc++_shared.so", "*/*/libmrtc_28181.so",
                "*/*/libmrtc_agora.so", "*/*/libmrtc_core.so", "*/*/libmrtc_core_jni.so", "*/*/libmrtc_data.so",
                "*/*/libmrtc_log.so", "*/*/libmrtc_onvif.so", "*/*/libmrtc_rtmp.so", "*/*/libmrtc_rtsp.so",
            )
            pickFirsts += listOf("lib/arm64-v8a/libc++_shared.so")
        }
    }
}

dependencies {
    implementation("com.dji:dji-sdk-v5-aircraft:$djiSdk")
    compileOnly("com.dji:dji-sdk-v5-aircraft-provided:$djiSdk")
    runtimeOnly("com.dji:dji-sdk-v5-networkImp:$djiSdk")

    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.multidex:multidex:2.0.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
