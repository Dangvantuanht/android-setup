package com.giftly.deviceassist

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Receives the DPC's reply to a "what's my token?" query (see MainActivity
 * and dpc-app's TokenQueryReceiver) — the fallback path for when the DPC's
 * own silent-install-then-launch didn't deliver the token via Intent extra
 * at launch time (e.g. a Knox install confirmation dialog interrupted it). */
class TokenReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val token = intent.getStringExtra(MainActivity.EXTRA_ENROLLMENT_TOKEN)
        if (token.isNullOrBlank()) return
        if (Prefs.getIdentity(context) == null) {
            Prefs.saveIdentity(context, "token", token)
        }
    }
}
