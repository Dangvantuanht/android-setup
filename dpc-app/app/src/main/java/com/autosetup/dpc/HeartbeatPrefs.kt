package com.autosetup.dpc

import android.content.Context

/** Survives process death/reboot so the heartbeat alarm can be re-armed without re-provisioning. */
object HeartbeatPrefs {
    private const val PREFS_NAME = "autosetup_heartbeat"
    private const val KEY_TOKEN = "enrollment_token"
    private const val KEY_HEARTBEAT_URL = "heartbeat_url"

    fun save(context: Context, token: String, heartbeatUrl: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_HEARTBEAT_URL, heartbeatUrl)
            .apply()
    }

    fun load(context: Context): Pair<String, String>? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        val heartbeatUrl = prefs.getString(KEY_HEARTBEAT_URL, null) ?: return null
        return token to heartbeatUrl
    }
}
