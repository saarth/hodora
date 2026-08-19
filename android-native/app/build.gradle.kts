import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.kapt)
}

// See secrets.properties.example — copy it to secrets.properties (gitignored)
// and fill in the same Supabase URL/anon key the web app uses.
val secrets =
    Properties().apply {
        val file = rootProject.file("secrets.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }

fun secret(key: String): String = secrets.getProperty(key).orEmpty()

android {
    namespace = "app.hodora.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.hodora.mobile"
        // 26+ (not the Capacitor build's 24) — notification channels and
        // adaptive icons already need API 26, and Phase 3's background-nav
        // notification needs channels regardless, so there's no reason to
        // support the sliver of devices below that floor.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "SUPABASE_URL", "\"${secret("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${secret("SUPABASE_ANON_KEY")}\"")
    }

    buildTypes {
        debug {
            // Lets a debug build install side-by-side with the Capacitor
            // app (app.hodora.mobile) during the transition period — see
            // "Phase 7 — cutover" in docs/NATIVE_ANDROID_PLAN.md.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

// The old `android { kotlinOptions { jvmTarget = "11" } }` string-based DSL
// is a hard error as of the Kotlin Gradle Plugin version bundled with
// Kotlin 2.3.20 (confirmed by a real Gradle config-phase error — "Using
// 'jvmTarget: String' is an error. Please migrate to the compilerOptions
// DSL.") — this top-level `kotlin { compilerOptions { ... } }` block is
// the replacement.
kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_11)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.supabase.postgrest)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.maplibre.android.sdk)
    implementation(libs.play.services.location)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    kapt(libs.room.compiler)
}
