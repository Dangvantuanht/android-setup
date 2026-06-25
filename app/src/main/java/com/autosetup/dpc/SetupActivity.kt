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

        // Android 11+ calls this activity with ADMIN_POLICY_COMPLIANCE during provisioning.
        // Just acknowledge and return — the real setup runs from onProfileProvisioningComplete.
        if (intent?.action == "android.app.action.ADMIN_POLICY_COMPLIANCE") {
            finish()
            return
        }

        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, AdminReceiver::class.java)

        runCatching {
            Settings.Global.putInt(contentResolver, Settings.Global.DEVICE_PROVISIONED, 1)
        }
        runCatching {
            dpm.setSecureSetting(admin, "user_setup_complete", "1")
        }
        runCatching {
            dpm.clearDeviceOwnerApp(packageName)
        }

        startActivity(Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        })

        finish()
    }
}
