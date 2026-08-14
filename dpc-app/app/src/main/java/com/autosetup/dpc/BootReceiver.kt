package com.autosetup.dpc

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-arms the heartbeat alarm after reboot — AlarmManager alarms don't survive a reboot. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        HeartbeatPrefs.load(context) ?: return
        HeartbeatAlarmReceiver.schedule(context, 0L)
    }
}
