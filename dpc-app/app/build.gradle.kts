plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.autosetup.dpc"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.autosetup.dpc"
        minSdk = 26
        targetSdk = 34
        versionCode = 10
        versionName = "2.2.0"
    }

    signingConfigs {
        create("release") {
            val keystorePath = providers.gradleProperty("AUTOS_SETUP_KEYSTORE").orNull
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = providers.gradleProperty("AUTOS_SETUP_STORE_PASSWORD").get()
                keyAlias = providers.gradleProperty("AUTOS_SETUP_KEY_ALIAS").get()
                keyPassword = providers.gradleProperty("AUTOS_SETUP_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            isDebuggable = false
            if (providers.gradleProperty("AUTOS_SETUP_KEYSTORE").isPresent) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions { jvmTarget = "1.8" }
}

dependencies {}
