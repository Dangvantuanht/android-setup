plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.giftly.deviceassist"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.giftly.deviceassist"
        minSdk = 26
        targetSdk = 34
        versionCode = 12
        versionName = "1.2.9"
    }

    signingConfigs {
        create("release") {
            val keystorePath = providers.gradleProperty("DEVICEASSIST_KEYSTORE").orNull
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = providers.gradleProperty("DEVICEASSIST_STORE_PASSWORD").get()
                keyAlias = providers.gradleProperty("DEVICEASSIST_KEY_ALIAS").get()
                keyPassword = providers.gradleProperty("DEVICEASSIST_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            isDebuggable = false
            if (providers.gradleProperty("DEVICEASSIST_KEYSTORE").isPresent) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
