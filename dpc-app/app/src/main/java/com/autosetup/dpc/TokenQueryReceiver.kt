package com.autosetup.dpc

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Lets the helper app ask "what's my enrollment token?" directly over a
 * same-device broadcast, for when DPC's own silent-install-then-launch
 * didn't actually deliver the token via Intent extra — e.g. a Knox install
 * confirmation dialog interrupted the automatic flow (see
 * HelperAppAlarmReceiver) and staff ended up opening the helper app by hand
 * from the launcher instead. DPC already knows the token from provisioning;
 * no need to re-derive device identity via the heartbeat signal or anything
 * fancier — it's the same device, right now, asking directly.
 */
class TokenQueryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        RemoteLog.log(context, "Helper app queried for its token")
        val token = HelperAppPrefs.peekToken(context)
        if (token.isNullOrBlank()) {
            Log.w(TAG, "Helper app asked for a token but none is on file")
            RemoteLog.log(context, "Helper app asked for a token but none is on file", "warn")
            return
        }
        val reply = Intent().apply {
            component = ComponentName(HELPER_PACKAGE, HELPER_REPLY_RECEIVER)
            putExtra(EXTRA_TOKEN_KEY, token)
        }
        try {
            context.sendBroadcast(reply)
            RemoteLog.log(context, "Replied to helper app with token")
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to reply with token: ${t.message}")
            RemoteLog.log(context, "Failed to reply with token: ${t.javaClass.simpleName}: ${t.message}", "error")
        }
    }

    companion object {
        private const val TAG = "AutoSetupDPC"
        private const val HELPER_PACKAGE = "com.giftly.deviceassist"
        private const val HELPER_REPLY_RECEIVER = "com.giftly.deviceassist.TokenReplyReceiver"
        // Matches MainActivity.EXTRA_ENROLLMENT_TOKEN in the helper app.
        private const val EXTRA_TOKEN_KEY = "enrollment_token"
        const val ACTION_QUERY_TOKEN = "com.autosetup.dpc.action.QUERY_HELPER_TOKEN"
    }
}
