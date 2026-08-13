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

        // Only present when this activity was launched by AdminReceiver's
        // onProfileProvisioningComplete (see its comment for why that's the
        // hook used, not this action alone). When the OS invokes this action
        // directly it won't carry these, and there's nothing to report yet.
        val token = intent.getStringExtra(EXTRA_KEY_ENROLLMENT_TOKEN)
        val callbackUrl = intent.getStringExtra(EXTRA_KEY_CALLBACK_URL)
        if (!token.isNullOrBlank() && !callbackUrl.isNullOrBlank()) {
            CallbackClient.notifyEnrollmentComplete(callbackUrl, token)
        }

        setResult(RESULT_OK, Intent())
        finish()
    }

    companion object {
        private const val TAG = "AutoSetupDPC"
        const val EXTRA_KEY_ENROLLMENT_TOKEN = "enrollment_token"
        const val EXTRA_KEY_CALLBACK_URL = "callback_url"
    }
}
