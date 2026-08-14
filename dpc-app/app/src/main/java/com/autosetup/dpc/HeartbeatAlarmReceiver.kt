package com.autosetup.dpc

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.SystemClock

/**
 * Self-rescheduling alarm that reports battery level to the backend every
 * [INTERVAL_MS] so the dashboard can show "last seen" / online status. Uses
 * AlarmManager instead of WorkManager to avoid pulling in an AndroidX
 * dependency for a single periodic POST — Device Owner apps are auto-granted
 * exact-alarm scheduling, so no extra permission prompt is needed.
 */
class HeartbeatAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val (token, heartbeatUrl) = HeartbeatPrefs.load(context) ?: return

        // goAsync() keeps the process alive past onReceive() returning — without
        // it, Android is free to kill the process the instant this method
        // returns, before a background Thread's network request completes.
        val pendingResult = goAsync()
        Thread {
            try {
                val battery = readBatteryLevel(context)
                CallbackClient.sendHeartbeatBlocking(heartbeatUrl, token, battery)
            } finally {
                schedule(context, INTERVAL_MS)
                pendingResult.finish()
            }
        }.start()
    }

    private fun readBatteryLevel(context: Context): Int? {
        val status = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return null
        val level = status.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = status.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return null
        return (level * 100) / scale
    }

    companion object {
        private const val INTERVAL_MS = 3 * 60 * 1000L

        private fun pendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, HeartbeatAlarmReceiver::class.java)
            return PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        fun schedule(context: Context, delayMs: Long) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val triggerAt = SystemClock.elapsedRealtime() + delayMs
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerAt,
                pendingIntent(context),
            )
        }

        /** Starts (or resumes, e.g. after reboot) the heartbeat loop. */
        fun start(context: Context, token: String, heartbeatUrl: String) {
            HeartbeatPrefs.save(context, token, heartbeatUrl)
            schedule(context, INTERVAL_MS)
        }
    }
}
