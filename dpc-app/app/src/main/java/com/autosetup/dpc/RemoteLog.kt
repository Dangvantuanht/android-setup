package com.autosetup.dpc

import android.content.Context
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import org.json.JSONObject

/**
 * Best-effort remote logging so staff can see what happened on a device even
 * with no physical USB/adb access — the screen can be frozen, or debugging
 * may have never been authorized on that exact device, both of which make
 * adb useless no matter how the DPC itself is configured. Fire-and-forget on
 * a background thread: a dropped log line is an acceptable trade-off for
 * never blocking or risking the actual provisioning flow, unlike
 * CallbackClient's enrollment/heartbeat calls which must be reliable.
 */
object RemoteLog {
    private const val TAG = "AutoSetupDPC"
    private const val PREFS_NAME = "autosetup_remote_log"
    private const val KEY_URL = "log_url"
    private const val KEY_TOKEN = "token"
    private const val TIMEOUT_MS = 5_000

    /** Call as early as possible once the token/log URL are known (both
     * AdminReceiver.onProfileProvisioningComplete and ProvisioningActivity's
     * ADMIN_POLICY_COMPLIANCE call this — whichever fires first wins, it's
     * just a SharedPreferences write, harmless to repeat). */
    fun init(context: Context, logUrl: String, token: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_URL, logUrl)
            .putString(KEY_TOKEN, token)
            .apply()
    }

    fun log(context: Context, message: String, level: String = "info") {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val url = prefs.getString(KEY_URL, null) ?: return
        val token = prefs.getString(KEY_TOKEN, null) ?: return
        Thread {
            try {
                val body = JSONObject().apply {
                    put("token", token)
                    put("source", "dpc")
                    put("level", level)
                    put("message", message)
                }.toString().toByteArray(StandardCharsets.UTF_8)
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = TIMEOUT_MS
                    readTimeout = TIMEOUT_MS
                    setRequestProperty("Content-Type", "application/json")
                }
                connection.outputStream.use { it.write(body) }
                connection.responseCode
                connection.disconnect()
            } catch (t: Throwable) {
                Log.w(TAG, "Remote log failed (non-fatal): ${t.message}")
            }
        }.start()
    }
}
