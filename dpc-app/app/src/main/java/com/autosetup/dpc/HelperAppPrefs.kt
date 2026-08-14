package com.autosetup.dpc

import android.content.Context

/** Survives process death/reboot so a not-yet-installed helper app can be retried without re-provisioning. */
object HelperAppPrefs {
    private const val PREFS_NAME = "autosetup_helper_app"
    private const val KEY_TOKEN = "enrollment_token"
    private const val KEY_APK_URL = "helper_apk_url"
    private const val KEY_ATTEMPTS = "attempts"
    private const val KEY_DONE = "done"

    fun save(context: Context, token: String, apkUrl: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_APK_URL, apkUrl)
            .putInt(KEY_ATTEMPTS, 0)
            .putBoolean(KEY_DONE, false)
            .apply()
    }

    /** Returns (token, apkUrl) or null if there's nothing pending (never started, or already done). */
    fun loadPending(context: Context): Pair<String, String>? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_DONE, false)) return null
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        val apkUrl = prefs.getString(KEY_APK_URL, null) ?: return null
        return token to apkUrl
    }

    fun markDone(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_DONE, true)
            .apply()
    }

    fun incrementAttempts(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val next = prefs.getInt(KEY_ATTEMPTS, 0) + 1
        prefs.edit().putInt(KEY_ATTEMPTS, next).apply()
        return next
    }
}
