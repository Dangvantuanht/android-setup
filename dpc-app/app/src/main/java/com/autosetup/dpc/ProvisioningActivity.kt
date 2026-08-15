package com.autosetup.dpc

import android.app.Activity
import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.media.AudioManager
import android.os.Bundle
import android.os.PersistableBundle
import android.util.Log

class ProvisioningActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        when (intent?.action) {
            DevicePolicyManager.ACTION_GET_PROVISIONING_MODE -> returnProvisioningMode()
            DevicePolicyManager.ACTION_ADMIN_POLICY_COMPLIANCE -> completeCompliance()
            else -> {
                Log.e(TAG, "Unsupported action: ${intent?.action}")
                setResult(RESULT_CANCELED)
                finish()
            }
        }
    }

    private fun returnProvisioningMode() {
        val allowed = intent.getIntegerArrayListExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES
        ).orEmpty()
        if (!allowed.contains(DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE)) {
            Log.e(TAG, "Fully managed mode not offered; allowed=$allowed")
            setResult(RESULT_CANCELED)
            finish()
            return
        }

        val result = Intent().apply {
            putExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_MODE,
                DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
            )
            putExtra(DevicePolicyManager.EXTRA_PROVISIONING_SKIP_EDUCATION_SCREENS, true)
        }
        Log.i(TAG, "Selected fully managed provisioning")
        setResult(RESULT_OK, result)
        finish()
    }

    private fun completeCompliance() {
        val dpm = getSystemService(DevicePolicyManager::class.java)
        if (!dpm.isDeviceOwnerApp(packageName)) {
            Log.e(TAG, "Compliance requested before Device Owner was established")
            setResult(RESULT_CANCELED)
            finish()
            return
        }
        Log.i(TAG, "Device Owner established; provisioning complete")

        // Primary enrollment-report path. ACTION_PROFILE_PROVISIONING_COMPLETE
        // (the "documented" hook, handled in AdminReceiver) does NOT reliably
        // fire on real Samsung/Knox devices in testing — confirmed via logcat,
        // it never arrives even though this activity's ADMIN_POLICY_COMPLIANCE
        // does. So this reads the same admin extras bundle directly off this
        // intent instead of depending on that broadcast.
        @Suppress("DEPRECATION") // two-arg getParcelableExtra needs API 33; minSdk here is 26
        val adminExtras = intent.getParcelableExtra<PersistableBundle>(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
        )
        val token = adminExtras?.getString(EXTRA_KEY_ENROLLMENT_TOKEN)
        val callbackUrl = adminExtras?.getString(EXTRA_KEY_CALLBACK_URL)
        val heartbeatUrl = adminExtras?.getString(EXTRA_KEY_HEARTBEAT_URL)
        val helperApkUrl = adminExtras?.getString(EXTRA_KEY_HELPER_APK_URL)
        val logUrl = adminExtras?.getString(EXTRA_KEY_LOG_URL)
        // As early as possible — if the device is about to freeze (the
        // Xiaomi/MIUI white-screen case this was built for), every log call
        // from here on has a chance of getting out before that happens.
        if (!logUrl.isNullOrBlank() && !token.isNullOrBlank()) {
            RemoteLog.init(this, logUrl, token)
        }
        RemoteLog.log(this, "Device Owner established; provisioning complete")
        silenceDevice()

        Log.i(TAG, "Admin extras on ADMIN_POLICY_COMPLIANCE: token=${!token.isNullOrBlank()} callback=${!callbackUrl.isNullOrBlank()}")

        if (!token.isNullOrBlank() && !callbackUrl.isNullOrBlank()) {
            // This no-history activity is about to finish(); a bare background
            // Thread wouldn't reliably survive that (see CallbackClient's doc
            // comment). Block briefly instead — bounded by the same 5s network
            // timeout, plus slack — so the report actually goes out first.
            val worker = Thread {
                CallbackClient.notifyEnrollmentCompleteBlocking(callbackUrl, token)
                RemoteLog.log(this, "Enrollment callback sent")
                if (!heartbeatUrl.isNullOrBlank()) {
                    HeartbeatAlarmReceiver.start(this, token, heartbeatUrl)
                }
                // Only scheduled here (fire-and-forget alarm, well after this
                // activity finishes) — silently downloading+installing an APK
                // is much slower than the heartbeat's single POST and must
                // never be allowed to delay reaching Home.
                if (!helperApkUrl.isNullOrBlank()) {
                    HelperAppAlarmReceiver.start(this, token, helperApkUrl)
                }
            }
            worker.start()
            worker.join(6_000)
        }

        RemoteLog.log(this, "ProvisioningActivity finishing — handing off to Home")
        setResult(RESULT_OK, Intent())
        finish()
    }

    /**
     * Freshly-provisioned shop/demo devices shouldn't blast setup/notification
     * sounds. Device Owner apps are auto-granted Notification Policy Access
     * (DND control) without a user prompt, unlike normal apps.
     */
    private fun silenceDevice() {
        try {
            val audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
            val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (notificationManager.isNotificationPolicyAccessGranted) {
                audioManager.ringerMode = AudioManager.RINGER_MODE_SILENT
            }
            for (stream in intArrayOf(
                AudioManager.STREAM_MUSIC,
                AudioManager.STREAM_ALARM,
                AudioManager.STREAM_NOTIFICATION,
                AudioManager.STREAM_RING,
                AudioManager.STREAM_SYSTEM,
            )) {
                audioManager.setStreamVolume(stream, 0, 0)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to silence device (non-fatal): ${t.message}")
        }
    }

    companion object {
        private const val TAG = "AutoSetupDPC"
        const val EXTRA_KEY_ENROLLMENT_TOKEN = "enrollment_token"
        const val EXTRA_KEY_CALLBACK_URL = "callback_url"
        const val EXTRA_KEY_HEARTBEAT_URL = "heartbeat_url"
        const val EXTRA_KEY_HELPER_APK_URL = "helper_apk_url"
        const val EXTRA_KEY_LOG_URL = "log_url"
    }
}
