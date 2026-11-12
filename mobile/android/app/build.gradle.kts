plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.aakash.jitterbug"
    compileSdkVersion("android-37.0")
    defaultConfig {
        applicationId = "com.aakash.reskon"
        minSdk = 26
        targetSdk = 36
        // One version for everything: the VERSION file at the top of the repository (see internal/version).
        // versionCode is major * 10000 + minor * 100 + patch, so a newer version is always a higher number.
        val version = file("../../../VERSION").readText().trim()
        val (major, minor, patch) = version.split(".").map { it.toInt() }
        versionCode = major * 10000 + minor * 100 + patch
        versionName = version
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    // The release key lives outside the repo (X:\Personal\Keys). mobile/release.ps1 sets these two
    // variables from it; without them the release build is left unsigned instead of using a wrong key.
    val keystorePath: String? = System.getenv("RESKON_KEYSTORE")
    val signPass: String? = System.getenv("RESKON_KEY_PASS")
    signingConfigs {
        if (keystorePath != null && signPass != null) {
            create("reskon") {
                storeFile = file(keystorePath)
                storePassword = signPass // a .p12/.jks made by keytool uses one password for both
                keyAlias = "reskon"
                keyPassword = signPass
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("reskon")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
    // Plain JVM tests may touch android.util.Log and the like; they get harmless defaults.
    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.13.0")
    // JitterBug's Go core: mobile/build.ps1 builds it from mobile/jbcore.
    implementation(files("../../build/jbcore.aar"))

    // JVM tests (gradlew testDebugUnitTest). org.json is a stub in the Android
    // jar, so the real one is added for tests.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814")

    // On-device tests (gradlew connectedDebugAndroidTest): need an emulator or a
    // spare phone. NOT the daily-use phone: they install the same app id.
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.09.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
