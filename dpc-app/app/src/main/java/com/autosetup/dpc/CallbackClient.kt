package com.autosetup.dpc

import android.os.Build
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import org.json.JSONObject

/**
 * Best-effort report to the provisioning backend. Must never throw and must
 * never block/fail provisioning.
 *
 * These are BLOCKING calls — callers are responsible for running them off the
 * main thread AND for keeping the process alive until they return (e.g. via
 * BroadcastReceiver.goAsync()). A bare fire-and-forget Thread is not enough:
 * once the triggering Activity.finish()es or the BroadcastReceiver's
 * onReceive() returns, Android is free to kill the process before an
 * in-flight background Thread's network request completes — that silently
 * dropped every callback/heartbeat in earlier testing.
 */
object CallbackClient {
    private const val TAG = "AutoSetupDPC"
    private const val TIMEOUT_MS = 5_000

    fun notifyEnrollmentCompleteBlocking(callbackUrl: String, token: String) {
        try {
            val body = JSONObject().apply {
                put("token", token)
                put("model", Build.MODEL)
                put("androidRelease", Build.VERSION.RELEASE)
            }.toString().toByteArray(StandardCharsets.UTF_8)
            postJson(callbackUrl, body)
        } catch (t: Throwable) {
            Log.w(TAG, "Callback failed (non-fatal): ${t.message}")
        }
    }

    fun sendHeartbeatBlocking(heartbeatUrl: String, token: String, batteryLevel: Int?) {
        try {
            val body = JSONObject().apply {
                put("token", token)
                put("model", Build.MODEL)
                if (batteryLevel != null) put("batteryLevel", batteryLevel)
            }.toString().toByteArray(StandardCharsets.UTF_8)
            postJson(heartbeatUrl, body)
        } catch (t: Throwable) {
            Log.w(TAG, "Heartbeat failed (non-fatal): ${t.message}")
        }
    }

    private fun postJson(url: String, body: ByteArray) {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("Content-Type", "application/json")
        }
        connection.outputStream.use { it.write(body) }
        Log.i(TAG, "$url responded with ${connection.responseCode}")
        connection.disconnect()
    }
}
