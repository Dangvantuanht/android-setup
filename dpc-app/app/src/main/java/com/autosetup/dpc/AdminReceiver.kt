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
        // (enrollment_token/callback_url/heartbeat_url) set by the QR.
        @Suppress("DEPRECATION") // two-arg getParcelableExtra needs API 33; minSdk here is 26
        val adminExtras = intent.getParcelableExtra<PersistableBundle>(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
        )
        val token = adminExtras?.getString(ProvisioningActivity.EXTRA_KEY_ENROLLMENT_TOKEN)
        val callbackUrl = adminExtras?.getString(ProvisioningActivity.EXTRA_KEY_CALLBACK_URL)
        val heartbeatUrl = adminExtras?.getString(ProvisioningActivity.EXTRA_KEY_HEARTBEAT_URL)
        val logUrl = adminExtras?.getString(ProvisioningActivity.EXTRA_KEY_LOG_URL)
        // Redundant with ProvisioningActivity's own RemoteLog.init() — this
        // callback is the more reliable one (fires on every Android version,
        // unlike ADMIN_POLICY_COMPLIANCE which some OEM skins skip), so it's
        // the safer place to guarantee logging actually gets wired up.
        if (!logUrl.isNullOrBlank() && !token.isNullOrBlank()) {
            RemoteLog.init(context, logUrl, token)
        }
        RemoteLog.log(context, "onProfileProvisioningComplete fired")

        if (token.isNullOrBlank() || callbackUrl.isNullOrBlank()) {
            Log.w(TAG, "No enrollment token/callback URL in admin extras — nothing to report")
            return
        }

        // goAsync() extends this receiver's lifetime (up to ~10s) past the
        // return of onProfileProvisioningComplete, so the process isn't
        // eligible for teardown mid-request the way a bare Thread's work
        // would be. See CallbackClient's doc comment for why this matters.
        val pendingResult = goAsync()
        Thread {
            try {
                CallbackClient.notifyEnrollmentCompleteBlocking(callbackUrl, token)
                if (!heartbeatUrl.isNullOrBlank()) {
                    HeartbeatAlarmReceiver.start(context, token, heartbeatUrl)
                }
            } finally {
                pendingResult.finish()
            }
        }.start()
    }

    companion object {
        private const val TAG = "AutoSetupDPC"
    }
}
