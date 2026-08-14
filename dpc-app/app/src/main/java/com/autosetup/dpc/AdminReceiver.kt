package com.autosetup.dpc

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.PersistableBundle
import android.util.Log

class AdminReceiver : DeviceAdminReceiver() {
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        Log.i(TAG, "Profile provisioning complete")

        // Present on every supported Android version (this callback fires
        // regardless of whether the OS also drives GET_PROVISIONING_MODE /
        // ADMIN_POLICY_COMPLIANCE itself, which only happens on Android 12+).
        // This is what carries the custom PROVISIONING_ADMIN_EXTRAS_BUNDLE
        // (enrollment_token/callback_url) set by the provisioning QR.
        @Suppress("DEPRECATION") // two-arg getParcelableExtra needs API 33; minSdk here is 26
        val adminExtras = intent.getParcelableExtra<PersistableBundle>(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
        )
        val token = adminExtras?.getString(ProvisioningActivity.EXTRA_KEY_ENROLLMENT_TOKEN)
        val callbackUrl = adminExtras?.getString(ProvisioningActivity.EXTRA_KEY_CALLBACK_URL)
        val heartbeatUrl = adminExtras?.getString(ProvisioningActivity.EXTRA_KEY_HEARTBEAT_URL)

        context.startActivity(Intent(context, ProvisioningActivity::class.java).apply {
            action = ACTION_ADMIN_POLICY_COMPLIANCE
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(ProvisioningActivity.EXTRA_KEY_ENROLLMENT_TOKEN, token)
            putExtra(ProvisioningActivity.EXTRA_KEY_CALLBACK_URL, callbackUrl)
            putExtra(ProvisioningActivity.EXTRA_KEY_HEARTBEAT_URL, heartbeatUrl)
        })
    }

    companion object {
        private const val TAG = "AutoSetupDPC"
        private const val ACTION_ADMIN_POLICY_COMPLIANCE =
            "android.app.action.ADMIN_POLICY_COMPLIANCE"
    }
}
