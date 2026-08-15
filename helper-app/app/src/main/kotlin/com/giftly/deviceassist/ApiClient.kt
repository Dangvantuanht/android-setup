package com.giftly.deviceassist

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

data class GmailCredential(val email: String, val password: String)
data class TargetApp(val packageName: String, val label: String)

// Mirrors the server's discriminated resolveClaimant() reasons (see
// provisioning.routes.ts) so the device can tell "typed the wrong code" apart
// from "this code timed out — go get a fresh one" instead of one generic
// failure message that left staff guessing what to do next.
sealed class ClaimResult {
    data class Success(val credential: GmailCredential) : ClaimResult()
    data class Failure(val reason: String) : ClaimResult() {
        // "expired" | "not_found" | "revoked" | "invalid" (bad code, needs a
        // new one) vs "no gmail accounts available" (pool exhausted — same
        // code is still fine, nothing to re-enter) vs "network"/"unknown".
        val needsNewCode: Boolean
            get() = reason == "expired" || reason == "not_found" || reason == "revoked" || reason == "invalid"
    }
}

/** Talks to the provisioning server's public device-facing endpoints — same
 * server the DPC app already reports to (see dpc-app's CallbackClient.kt). */
object ApiClient {
    private const val TAG = "DeviceAssist"
    private const val BASE_URL = "https://auto.giftly.biz"
    private const val TIMEOUT_MS = 10_000

    private fun identityJson(kind: String, value: String): JSONObject =
        JSONObject().apply { put(if (kind == "token") "token" else "code", value) }

    fun claimGmail(kind: String, value: String): ClaimResult {
        return try {
            val body = identityJson(kind, value).toString()
            val (code, response) = post("$BASE_URL/api/provisioning/gmail-claim", body)
            if (code != 200) {
                val reason = try {
                    JSONObject(response).optString("error", "unknown")
                } catch (t: Throwable) {
                    "unknown"
                }
                Log.w(TAG, "gmail-claim failed: HTTP $code $reason")
                return ClaimResult.Failure(reason)
            }
            val json = JSONObject(response)
            ClaimResult.Success(GmailCredential(json.getString("email"), json.getString("password")))
        } catch (t: Throwable) {
            Log.w(TAG, "gmail-claim error: ${t.message}")
            ClaimResult.Failure("network")
        }
    }

    fun reportOutcome(kind: String, value: String, email: String, success: Boolean) {
        try {
            val body = identityJson(kind, value).apply {
                put("email", email)
                put("outcome", if (success) "SUCCESS" else "FAILED")
            }.toString()
            post("$BASE_URL/api/provisioning/gmail-report", body)
        } catch (t: Throwable) {
            Log.w(TAG, "gmail-report error: ${t.message}")
        }
    }

    // Fire-and-forget on a background thread — called from every log() line
    // during the automation loop, must never add latency or risk blocking
    // the AccessibilityService's click loop. Lets staff see exactly where
    // the automation got stuck without needing physical adb access (screen
    // frozen, debugging never authorized, etc).
    fun sendLog(kind: String, value: String, message: String, level: String = "info") {
        Thread {
            try {
                val body = identityJson(kind, value).apply {
                    put("source", "helper")
                    put("level", level)
                    put("message", message)
                }.toString()
                post("$BASE_URL/api/provisioning/log", body)
            } catch (t: Throwable) {
                Log.w(TAG, "log-send error (non-fatal): ${t.message}")
            }
        }.start()
    }

    fun fetchTargetApps(): List<TargetApp> {
        return try {
            val (code, response) = get("$BASE_URL/api/provisioning/target-apps")
            if (code != 200) return emptyList()
            val arr = JSONArray(response)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                TargetApp(o.getString("packageName"), o.getString("label"))
            }
        } catch (t: Throwable) {
            Log.w(TAG, "target-apps error: ${t.message}")
            emptyList()
        }
    }

    private fun post(url: String, body: String): Pair<Int, String> {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = TIMEOUT_MS
        conn.readTimeout = TIMEOUT_MS
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
        return readResponse(conn)
    }

    private fun get(url: String): Pair<Int, String> {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = TIMEOUT_MS
        conn.readTimeout = TIMEOUT_MS
        return readResponse(conn)
    }

    private fun readResponse(conn: HttpURLConnection): Pair<Int, String> {
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.readText() ?: ""
        conn.disconnect()
        return code to text
    }
}
