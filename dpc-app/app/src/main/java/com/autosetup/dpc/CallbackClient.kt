package com.autosetup.dpc

import android.os.Build
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import org.json.JSONObject

/**
 * Best-effort, fire-and-forget report to the provisioning backend that this
 * session finished. Must never throw out of [notifyEnrollmentComplete] and
 * must never block/fail provisioning — the OS proceeds to home regardless of
 * whether this call succeeds.
 */
object CallbackClient {
    private const val TAG = "AutoSetupDPC"
    private const val TIMEOUT_MS = 5_000

    fun notifyEnrollmentComplete(callbackUrl: String, token: String) {
        Thread {
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
        }.start()
    }

    fun sendHeartbeat(heartbeatUrl: String, token: String, batteryLevel: Int?) {
        Thread {
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
        }.start()
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
