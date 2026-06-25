package com.autosetup.dpc

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.provider.Settings

class SetupActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, AdminReceiver::class.java)

        // Mark device as provisioned — skips the Android setup wizard
        runCatching {
            Settings.Global.putInt(contentResolver, Settings.Global.DEVICE_PROVISIONED, 1)
        }

        // Mark user setup as complete — dismisses remaining wizard screens
        runCatching {
            dpm.setSecureSetting(admin, "user_setup_complete", "1")
        }

        // Remove ourselves as Device Owner — phone is now fully unmanaged
        runCatching {
            dpm.clearDeviceOwnerApp(packageName)
        }

        // Go straight to home screen
        startActivity(Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        })

        finish()
    }
}
