pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()   // DJI Mobile SDK v5 is published on Maven Central
    }
}
rootProject.name = "Drone3D"
include(":app")      // DJI Mobile SDK app (Mini 3/4 Pro, Enterprise...) + desktop server
include(":avata")    // phone-only plugin for DJI Avata 1/2 (screen capture of DJI Fly)
