package com.autosetup.dpc

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Silently installs + launches the helper app (com.giftly.deviceassist)
 * shortly after activation finishes. Runs on its own delayed AlarmManager
 * trigger, decoupled from the critical provisioning path (ProvisioningActivity
 * already finish()es without waiting on this) so it never slows down "time to
 * Home". Device Owner apps can install other packages silently via
 * PackageInstaller — no confirmation dialog, unlike a normal app doing the
 * same thing.
 */
class HelperAppAlarmReceiver : BroadcastReceiver() {
    // Also doubles as the PackageInstaller commit() result callback (see
    // downloadAndInstall) — re-running the same "check if installed yet"
    // logic on that callback works out correctly without needing to parse
    // PackageInstaller.EXTRA_STATUS separately.
    override fun onReceive(context: Context, intent: Intent) {
        val (token, apkUrl) = HelperAppPrefs.loadPending(context) ?: return

        if (isHelperInstalled(context)) {
            HelperAppPrefs.markDone(context)
            launchHelper(context, token)
            return
        }

        val attempt = HelperAppPrefs.incrementAttempts(context)
        if (attempt > MAX_ATTEMPTS) {
            Log.w(TAG, "Giving up installing helper app after $MAX_ATTEMPTS attempts")
            return
        }

        val pendingResult = goAsync()
        Thread {
            try {
                if (downloadAndInstall(context, apkUrl)) {
                    HelperAppPrefs.markDone(context)
                    launchHelper(context, token)
                } else {
                    schedule(context, RETRY_DELAY_MS)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "Helper app install failed: ${t.message}")
                schedule(context, RETRY_DELAY_MS)
            } finally {
                pendingResult.finish()
            }
        }.start()
    }

    private fun isHelperInstalled(context: Context): Boolean {
        return try {
            context.packageManager.getPackageInfo(HELPER_PACKAGE, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun downloadAndInstall(context: Context, apkUrl: String): Boolean {
        val apkFile = File(context.cacheDir, "helper.apk")
        val conn = URL(apkUrl).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        conn.connect()
        if (conn.responseCode != 200) {
            Log.w(TAG, "Helper APK download failed: HTTP ${conn.responseCode}")
            conn.disconnect()
            return false
        }
        conn.inputStream.use { input ->
            apkFile.outputStream().use { output -> input.copyTo(output) }
        }
        conn.disconnect()

        val packageInstaller = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val sessionId = packageInstaller.createSession(params)
        val session = packageInstaller.openSession(sessionId)
        try {
            session.openWrite("helper", 0, apkFile.length()).use { out ->
                apkFile.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val resultIntent = Intent(context, HelperAppAlarmReceiver::class.java)
            val resultPendingIntent = PendingIntent.getBroadcast(
                context, sessionId, resultIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(resultPendingIntent.intentSender)
        } finally {
            session.close()
        }
        apkFile.delete()

        // In principle a Device Owner's PackageInstaller session commits with
        // zero UI. Confirmed live on a real Samsung/Knox device that this is
        // NOT always true in practice — Knox showed its own install
        // confirmation dialog despite Device Owner + USER_ACTION_NOT_REQUIRED,
        // needing a person to actually tap it. A short poll here previously
        // timed out before that happened, was treated as failure, and
        // re-downloaded + re-committed a brand new session — which is why
        // staff saw the same confirmation prompt fire two or three times for
        // a single install. Wait long enough for a human reaction, not just
        // for a truly-silent install.
        val deadline = SystemClock.elapsedRealtime() + INSTALL_POLL_TIMEOUT_MS
        while (SystemClock.elapsedRealtime() < deadline) {
            if (isHelperInstalled(context)) return true
            Thread.sleep(1_000)
        }
        return false
    }

    private fun launchHelper(context: Context, token: String) {
        try {
            val launch = Intent().apply {
                component = ComponentName(HELPER_PACKAGE, HELPER_MAIN_ACTIVITY)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(EXTRA_TOKEN_KEY, token)
            }
            context.startActivity(launch)
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to launch helper app: ${t.message}")
        }
    }

    companion object {
        private const val TAG = "AutoSetupDPC"
        private const val HELPER_PACKAGE = "com.giftly.deviceassist"
        private const val HELPER_MAIN_ACTIVITY = "com.giftly.deviceassist.MainActivity"
        // Matches MainActivity.EXTRA_ENROLLMENT_TOKEN in the helper app.
        private const val EXTRA_TOKEN_KEY = "enrollment_token"
        private const val MAX_ATTEMPTS = 3
        private const val FIRST_FIRE_DELAY_MS = 25 * 1000L
        private const val RETRY_DELAY_MS = 60 * 1000L
        // Long enough to cover a person noticing + tapping a Knox install
        // confirmation dialog once, not just a genuinely-silent install.
        private const val INSTALL_POLL_TIMEOUT_MS = 3 * 60 * 1000L

        private fun pendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, HelperAppAlarmReceiver::class.java)
            return PendingIntent.getBroadcast(
                context, 1, intent,
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

        /** First firing is delayed past the heartbeat's own first fire (15s)
         * so the two don't compete for the very first seconds after Home. */
        fun start(context: Context, token: String, apkUrl: String) {
            HelperAppPrefs.save(context, token, apkUrl)
            schedule(context, FIRST_FIRE_DELAY_MS)
        }
    }
}
