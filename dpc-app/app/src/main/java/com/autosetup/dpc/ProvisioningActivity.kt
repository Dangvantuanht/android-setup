package com.autosetup.dpc

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle
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

        // Reporting enrollment (callback/heartbeat) happens in AdminReceiver.
        // onProfileProvisioningComplete via goAsync(), not here — this action,
        // when invoked directly by the OS (admin-integrated flow), carries no
        // extras and this activity's only job is to confirm compliance.
        setResult(RESULT_OK, Intent())
        finish()
    }

    companion object {
        private const val TAG = "AutoSetupDPC"
        const val EXTRA_KEY_ENROLLMENT_TOKEN = "enrollment_token"
        const val EXTRA_KEY_CALLBACK_URL = "callback_url"
        const val EXTRA_KEY_HEARTBEAT_URL = "heartbeat_url"
    }
}
