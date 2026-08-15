package com.autosetup.dpc

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-arms the heartbeat + pending helper-app-install alarms after reboot — AlarmManager alarms don't survive a reboot. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        RemoteLog.log(context, "BOOT_COMPLETED — re-arming alarms")
        if (HeartbeatPrefs.load(context) != null) {
            HeartbeatAlarmReceiver.schedule(context, 0L)
        }
        if (HelperAppPrefs.loadPending(context) != null) {
            HelperAppAlarmReceiver.schedule(context, 0L)
        }
    }
}
