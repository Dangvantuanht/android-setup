package com.giftly.deviceassist

import android.content.Context

/**
 * Only the device's claim identity (DPC token or manually-typed code) is
 * persisted. The Gmail password is fetched fresh from the server each run
 * and kept in memory only (see SetupAssistService) — never written to disk.
 */
object Prefs {
    private const val FILE = "deviceassist_prefs"
    private const val KEY_IDENTITY_KIND = "identity_kind" // "token" | "code"
    private const val KEY_IDENTITY_VALUE = "identity_value"
    private const val KEY_SETUP_DONE = "setup_done"

    private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun saveIdentity(context: Context, kind: String, value: String) {
        prefs(context).edit()
            .putString(KEY_IDENTITY_KIND, kind)
            .putString(KEY_IDENTITY_VALUE, value)
            .apply()
    }

    /** Returns (kind, value) or null if no identity has been set yet. */
    fun getIdentity(context: Context): Pair<String, String>? {
        val p = prefs(context)
        val kind = p.getString(KEY_IDENTITY_KIND, null) ?: return null
        val value = p.getString(KEY_IDENTITY_VALUE, null) ?: return null
        return kind to value
    }

    // Called when the server tells us the claim code is expired/unknown/
    // revoked — the saved code is dead, so drop it and let the UI prompt for
    // a fresh one instead of silently retrying the same bad value forever.
    fun clearIdentity(context: Context) {
        prefs(context).edit()
            .remove(KEY_IDENTITY_KIND)
            .remove(KEY_IDENTITY_VALUE)
            .apply()
    }

    fun isSetupDone(context: Context): Boolean = prefs(context).getBoolean(KEY_SETUP_DONE, false)

    fun setSetupDone(context: Context, done: Boolean) {
        prefs(context).edit().putBoolean(KEY_SETUP_DONE, done).apply()
    }
}
