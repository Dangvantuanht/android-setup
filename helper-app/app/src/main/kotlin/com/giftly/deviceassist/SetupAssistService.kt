package com.giftly.deviceassist

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Drives the Google sign-in + Play Store install flow via Accessibility.
 *
 * IMPORTANT: the exact view IDs / button text Google uses shift over time,
 * by GMS Core version, and by locale — this first version uses best-effort
 * generic matching (view-id suffixes + multi-language text + structural
 * hints like isPassword()/isEditable()) modeled on the step sequence a
 * comparable tool uses, but WILL need tuning against real device logcat
 * (filter tag "DeviceAssist") the first few times it runs against an actual
 * Google sign-in flow — matches the same live-iteration reality we hit
 * tuning the DPC against real Samsung/Android quirks.
 */
class SetupAssistService : AccessibilityService() {

    private var flowThread: Thread? = null

    @Volatile var isFlowRunning: Boolean = false
        private set

    @Volatile private var cancelRequested: Boolean = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "Service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Flow runs on its own polling thread (see runFlow) rather than being
        // purely event-driven — simpler to reason about and matches how the
        // reference automation engine we studied structures its main loop.
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        if (instance == this) instance = null
        super.onDestroy()
    }

    // Lets the UI abort a run stuck retrying (e.g. Google rejecting sign-in
    // repeatedly) instead of the user having to wait out the full timeout.
    fun cancelFlow() {
        cancelRequested = true
    }

    // apps is the set the operator picked in MainActivity's checkbox list —
    // fetched from the server once and filtered locally, not re-fetched here,
    // so what actually installs matches exactly what was shown/checked.
    fun startFlow(kind: String, value: String, apps: List<TargetApp>, onLog: (String) -> Unit, onDone: (Boolean) -> Unit) {
        if (flowThread?.isAlive == true) return
        cancelRequested = false
        isFlowRunning = true
        flowThread = Thread {
            try {
                val ok = runFlow(kind, value, apps, onLog)
                onDone(ok)
            } catch (t: Throwable) {
                Log.e(TAG, "Flow failed", t)
                onLog("Lỗi: ${t.message}")
                onDone(false)
            } finally {
                isFlowRunning = false
            }
        }.also { it.start() }
    }

    private fun runFlow(kind: String, value: String, apps: List<TargetApp>, log: (String) -> Unit): Boolean {
        log("Đang lấy tài khoản Gmail...")
        val credential = ApiClient.claimGmail(kind, value)
        if (credential == null) {
            log("Không lấy được tài khoản Gmail (hết pool hoặc mã không hợp lệ).")
            return false
        }
        log("Đã nhận: ${credential.email}")

        log("Mở Play Store...")
        val launch = packageManager.getLaunchIntentForPackage(PLAY_STORE_PKG)
        if (launch == null) {
            log("Không tìm thấy Play Store trên máy.")
            ApiClient.reportOutcome(kind, value, credential.email, success = false)
            return false
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launch)
        waitMs(2_000)

        val loginOk = driveGoogleSignIn(credential, log)
        ApiClient.reportOutcome(kind, value, credential.email, success = loginOk)
        if (!loginOk) {
            log("Đăng nhập Google không thành công — dừng lại, không cài app.")
            return false
        }
        log("Đăng nhập thành công.")

        if (apps.isEmpty()) {
            log("Không có app nào được chọn để cài.")
            return true
        }
        log("Cài ${apps.size} app: ${apps.joinToString { it.label }}")
        var allOk = true
        for (app in apps) {
            if (cancelRequested) {
                log("Đã dừng theo yêu cầu.")
                return false
            }
            log("Đang cài ${app.label}...")
            val ok = installApp(app, log)
            if (!ok) allOk = false
            log(if (ok) "✓ ${app.label} xong" else "✗ ${app.label} thất bại")
        }
        log("Hoàn tất.")
        return allOk
    }

    // ---- Google sign-in state machine ----------------------------------

    // rootInActiveWindow tracks whichever window Android currently considers
    // "active" — for an Activity launched from a background Service (not a
    // user tap), that designation can lag or stay pointed at our own app's
    // window even after Play Store is visually on top. Scanning the window
    // list directly and picking Play Store's/GMS's own window sidesteps that.
    //
    // Play Store can have MULTIPLE windows open for its own package at once
    // (e.g. a tooltip/popup overlay alongside the real home screen) — confirmed
    // live: picking the first package match grabbed a small "New in Comics"
    // tooltip popup instead of the home screen, so isPlayStoreHome() never
    // matched and the flow stalled forever without ever reaching app installs.
    // Prefer the window Android itself marks focused/active among matches.
    private fun activeRoot(): AccessibilityNodeInfo? {
        val windowList = windows
        if (windowList != null) {
            var fallback: AccessibilityNodeInfo? = null
            for (w in windowList) {
                val r = w.root
                if (r == null) continue
                val pkg = r.packageName?.toString()
                if (pkg == PLAY_STORE_PKG || pkg == "com.google.android.gms" || pkg == "com.google.android.gsf") {
                    if (w.isFocused || w.isActive) {
                        fallback?.recycle()
                        return r
                    }
                    if (fallback == null) fallback = r else r.recycle()
                    continue
                }
                r.recycle()
            }
            if (fallback != null) return fallback
        }
        return rootInActiveWindow
    }

    // Reference automation tooling caps a stalled Google login at a bounded
    // number of recovery cycles, then restarts the whole Play Store flow from
    // scratch rather than either hammering forever or giving up after one
    // hiccup. Mirrored here at coarser granularity (whole-attempt restarts,
    // not per-poll-cycle) since re-launching Play Store + re-typing email is
    // itself the "recovery" action.
    private fun driveGoogleSignIn(credential: GmailCredential, log: (String) -> Unit): Boolean {
        for (attempt in 1..MAX_SIGN_IN_ATTEMPTS) {
            if (cancelRequested) {
                log("Đã dừng theo yêu cầu.")
                return false
            }
            if (attemptGoogleSignIn(credential, log)) return true
            if (cancelRequested) return false
            if (attempt < MAX_SIGN_IN_ATTEMPTS) {
                log("Đăng nhập chưa qua được (lần $attempt/$MAX_SIGN_IN_ATTEMPTS) — mở lại Play Store thử lại...")
                restartPlayStore()
            }
        }
        log("Đăng nhập Google thất bại sau $MAX_SIGN_IN_ATTEMPTS lần thử.")
        return false
    }

    private fun restartPlayStore() {
        val launch = packageManager.getLaunchIntentForPackage(PLAY_STORE_PKG)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(launch)
        }
        waitMs(2_000)
    }

    private fun attemptGoogleSignIn(credential: GmailCredential, log: (String) -> Unit): Boolean {
        val deadline = SystemClock.elapsedRealtime() + SIGN_IN_TIMEOUT_MS
        // Once we've clicked past the consent/agree step at least once, seeing
        // the email field again means Google rejected/reset the attempt (e.g.
        // "tài khoản đã tồn tại trên máy" or a re-auth challenge) rather than
        // a normal step forward. Retrying identically in the same broken
        // session just re-submits the same login — end this attempt so the
        // caller can restart cleanly instead of hammering it in place.
        var passedAgree = false

        while (!cancelRequested && SystemClock.elapsedRealtime() < deadline) {
            val root = activeRoot()
            if (root == null) {
                waitMs(POLL_MS)
                continue
            }

            try {
                // Already signed in / Play Store home reached.
                if (isPlayStoreHome(root)) {
                    return true
                }

                // Play Store's initial "not signed in" landing screen shows a
                // single Sign-in button before any email field exists. Exact
                // match only — later screens' titles contain "ログイン" too.
                if (clickByText(root, SIGN_IN_TEXTS, exact = true)) {
                    log("Đã bấm nút đăng nhập")
                    waitMs(POLL_MS)
                    continue
                }

                // Re-check the actual field present on screen every cycle
                // instead of a one-shot "already typed" flag — confirmed live
                // that Google can re-prompt for email again after password +
                // consent (its own re-auth challenge, e.g. after repeated
                // sign-ins during testing), and a one-way flag gets stuck
                // forever refusing to re-fill it when that happens.
                val pwField = findEditable(root, isPassword = true)
                if (pwField != null) {
                    setText(pwField, credential.password)
                    log("Đã nhập mật khẩu")
                    clickByText(root, NEXT_TEXTS)
                    pwField.recycle()
                    waitMs(POLL_MS)
                    continue
                }

                val emailField = findEditable(root, isPassword = false)
                if (emailField != null) {
                    if (passedAgree) {
                        log("Google từ chối đăng nhập lại (có thể tài khoản đã tồn tại trên máy).")
                        emailField.recycle()
                        return false
                    }
                    setText(emailField, credential.email)
                    log("Đã nhập email")
                    clickByText(root, NEXT_TEXTS)
                    emailField.recycle()
                    waitMs(POLL_MS)
                    continue
                }

                // Consent / ToS / "Google Services" / backup prompts — click
                // through any recognized affirmative button, scrolling down
                // first if none is visible yet.
                if (clickByText(root, AFFIRM_TEXTS)) {
                    passedAgree = true
                    waitMs(POLL_MS)
                    continue
                }
                if (scrollDown(root)) {
                    waitMs(POLL_MS)
                    continue
                }
            } finally {
                root.recycle()
            }

            waitMs(POLL_MS)
        }
        if (!cancelRequested) {
            log("Hết thời gian chờ đăng nhập Google.")
        }
        return false
    }

    // exact=true here is load-bearing: the NOT-signed-in landing screen's own
    // description text ("...最新の Android アプリ、ゲーム、映画...") contains
    // "アプリ"/"ゲーム" as substrings — confirmed live that substring matching
    // made this return true immediately on that very first screen, skipping
    // the whole sign-in flow (claim→report happened within ~2s, far too fast
    // to have actually driven through it).
    private fun isPlayStoreHome(root: AccessibilityNodeInfo): Boolean {
        val pkg = root.packageName?.toString() ?: return false
        if (pkg != PLAY_STORE_PKG) return false
        return findByViewIdSuffix(root, "search_box") != null ||
            findByText(root, listOf("Apps", "Ứng dụng", "Games", "Trò chơi", "アプリ", "ゲーム"), exact = true) != null
    }

    // ---- App install -----------------------------------------------------

    private fun isPackageInstalled(packageName: String): Boolean {
        return try {
            packageManager.getApplicationInfo(packageName, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun installApp(app: TargetApp, log: (String) -> Unit): Boolean {
        // Reference automation tooling checks PackageManager first — far more
        // reliable than scanning for "Mở"/"Open" text, which varies by locale
        // and Play Store UI version. Some apps (TikTok, TikTok Lite) publish
        // under different applicationIds depending on device/region history —
        // confirmed live that the Play Store listing id and the actually
        // installed package name can differ. Check every known alternate
        // before deciding it isn't installed yet.
        val candidates = PACKAGE_ALTERNATES[app.packageName] ?: listOf(app.packageName)
        if (candidates.any { isPackageInstalled(it) }) {
            log("${app.label} đã cài sẵn.")
            return true
        }
        val launch = packageManager.getLaunchIntentForPackage(PLAY_STORE_PKG)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(launch)
        }
        // Deep-link straight to the app's Play Store page — far more reliable
        // than driving the search UI. setPackage forces it straight to Play
        // Store — confirmed live that Samsung devices also register Galaxy
        // Store for the market:// scheme, popping an app-chooser dialog our
        // click loop doesn't handle otherwise.
        val storeIntent = Intent(Intent.ACTION_VIEW)
        storeIntent.data = android.net.Uri.parse("market://details?id=${app.packageName}")
        storeIntent.setPackage(PLAY_STORE_PKG)
        storeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(storeIntent)
        } catch (t: Throwable) {
            log("Không mở được trang app: ${t.message}")
            return false
        }
        waitMs(2_500)

        val deadline = SystemClock.elapsedRealtime() + INSTALL_TIMEOUT_MS
        var tappedInstall = false
        while (!cancelRequested && SystemClock.elapsedRealtime() < deadline) {
            val root = activeRoot()
            if (root == null) {
                waitMs(POLL_MS)
                continue
            }
            try {
                if (findByText(root, listOf("Mở", "Open", "Gỡ cài đặt", "Uninstall", "開く", "アンインストール"), exact = false) != null) {
                    return true // already installed / install finished
                }
                if (!tappedInstall) {
                    tappedInstall = clickByText(root, listOf("Cài đặt", "Install", "インストール"))
                }
            } finally {
                root.recycle()
            }
            waitMs(POLL_MS)
        }
        return false
    }

    // ---- Generic AccessibilityNodeInfo helpers ---------------------------

    private fun findEditable(node: AccessibilityNodeInfo, isPassword: Boolean): AccessibilityNodeInfo? {
        if (node.isEditable && node.isVisibleToUser && node.isPassword == isPassword) {
            return AccessibilityNodeInfo.obtain(node)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                findEditable(child, isPassword)?.let { return it }
            } finally {
                child.recycle()
            }
        }
        return null
    }

    private fun findByViewIdSuffix(node: AccessibilityNodeInfo, suffix: String): AccessibilityNodeInfo? {
        val id = node.viewIdResourceName
        if (id != null && id.endsWith(suffix)) return AccessibilityNodeInfo.obtain(node)
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                findByViewIdSuffix(child, suffix)?.let { return it }
            } finally {
                child.recycle()
            }
        }
        return null
    }

    private fun findByText(
        node: AccessibilityNodeInfo,
        candidates: List<String>,
        exact: Boolean,
    ): AccessibilityNodeInfo? {
        val text = node.text?.toString() ?: node.contentDescription?.toString()
        if (text != null && node.isVisibleToUser) {
            val matches = candidates.any {
                if (exact) text.equals(it, ignoreCase = true)
                else text.contains(it, ignoreCase = true)
            }
            if (matches) return AccessibilityNodeInfo.obtain(node)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                findByText(child, candidates, exact)?.let { return it }
            } finally {
                child.recycle()
            }
        }
        return null
    }

    // Some GMS/Play Store elements carry an English contentDescription (e.g.
    // a decorative icon labeled "Sign in") that isn't the actual localized
    // button and has no clickable ancestor — matching only the first hit (as
    // findByText does) can silently grab that decoy instead of the real
    // button. Collect every match and try each until one is actually
    // clickable — confirmed live: the real "ログイン" button's own text node
    // was NOT the first match found this way.
    private fun findAllByText(
        node: AccessibilityNodeInfo,
        candidates: List<String>,
        out: MutableList<AccessibilityNodeInfo>,
        exact: Boolean = false,
    ) {
        val text = node.text?.toString() ?: node.contentDescription?.toString()
        if (text != null && node.isVisibleToUser) {
            val matches = candidates.any {
                if (exact) text.equals(it, ignoreCase = true) else text.contains(it, ignoreCase = true)
            }
            if (matches) out.add(AccessibilityNodeInfo.obtain(node))
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                findAllByText(child, candidates, out, exact)
            } finally {
                child.recycle()
            }
        }
    }

    // exact=true avoids matching screen TITLES that merely contain the same
    // word — e.g. "仕事用アカウントでログイン" (the email-entry screen's own
    // title) contains "ログイン" as a substring, which previously made the
    // sign-in click step fire again on every later screen and block real
    // progress (confirmed live via structure dump: findEditable never even
    // ran because clickByText kept "succeeding" on a decoy match first).
    private fun clickByText(root: AccessibilityNodeInfo, candidates: List<String>, exact: Boolean = false): Boolean {
        val matches = mutableListOf<AccessibilityNodeInfo>()
        findAllByText(root, candidates, matches, exact)
        try {
            for (node in matches) {
                if (clickNode(node)) return true
            }
            return false
        } finally {
            matches.forEach { it.recycle() }
        }
    }

    private fun clickNode(node: AccessibilityNodeInfo): Boolean {
        var target: AccessibilityNodeInfo? = node
        var depth = 0
        while (target != null && depth < 6) {
            if (target.isClickable) {
                return target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            target = target.parent
            depth++
        }
        return false
    }

    private fun setText(node: AccessibilityNodeInfo, text: String): Boolean {
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun scrollDown(root: AccessibilityNodeInfo): Boolean {
        val scrollable = findScrollable(root) ?: return false
        return try {
            scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
        } finally {
            scrollable.recycle()
        }
    }

    private fun findScrollable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return AccessibilityNodeInfo.obtain(node)
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            try {
                findScrollable(child)?.let { return it }
            } finally {
                child.recycle()
            }
        }
        return null
    }

    private fun waitMs(ms: Long) = SystemClock.sleep(ms)

    companion object {
        private const val TAG = "DeviceAssist"
        private const val PLAY_STORE_PKG = "com.android.vending"
        private const val POLL_MS = 600L
        private const val SIGN_IN_TIMEOUT_MS = 120_000L
        private const val INSTALL_TIMEOUT_MS = 90_000L
        // Reference automation tooling caps its Google-login recovery loop at
        // 10 (fine-grained, per-poll-cycle) retries before restarting from
        // scratch. Our "attempt" is coarser — a full Play Store relaunch +
        // fresh email/password/agree pass — so 3 full attempts is the
        // equivalent bound without hammering Google's sign-in endpoint.
        private const val MAX_SIGN_IN_ATTEMPTS = 3

        // Same underlying app can install under a different applicationId
        // depending on device/region history (confirmed live: Play Store's
        // own listing id for TikTok didn't match the package that actually
        // ends up installed on this device). Reference tooling handles this
        // by trying every known alternate before concluding "not installed".
        private val PACKAGE_ALTERNATES: Map<String, List<String>> = mapOf(
            "com.ss.android.ugc.trill" to listOf("com.ss.android.ugc.trill", "com.zhiliaoapp.musically"),
            "com.zhiliaoapp.musically" to listOf("com.ss.android.ugc.trill", "com.zhiliaoapp.musically"),
            "com.ss.android.ugc.tiktok.lite" to listOf(
                "com.ss.android.ugc.tiktok.lite", "com.zhiliaoapp.musically.go", "com.tiktok.lite.go",
            ),
            "com.zhiliaoapp.musically.go" to listOf(
                "com.ss.android.ugc.tiktok.lite", "com.zhiliaoapp.musically.go", "com.tiktok.lite.go",
            ),
            "com.tiktok.lite.go" to listOf(
                "com.ss.android.ugc.tiktok.lite", "com.zhiliaoapp.musically.go", "com.tiktok.lite.go",
            ),
        )

        private val NEXT_TEXTS = listOf("Tiếp theo", "Next", "次へ")
        private val SIGN_IN_TEXTS = listOf("Đăng nhập", "Sign in", "ログイン")
        // Confirmed against a real device run (2026-08-14): Play Store's
        // sign-in flow shows a ToS screen ("同意する"), then a contacts-backup
        // prompt ("有効にしない" to skip) and a recovery-info prompt
        // ("キャンセル" to skip) before reaching Play Store home.
        private val AFFIRM_TEXTS = listOf(
            "Tôi đồng ý", "I agree", "Chấp nhận", "Accept",
            "Không, cảm ơn", "No thanks", "Bỏ qua", "Skip",
            "Tôi hiểu", "I understand", "Tiếp tục", "Continue",
            "Xem thêm", "More", "OK", "Đồng ý",
            "同意する", "有効にしない", "キャンセル", "スキップ", "後で",
        )

        @Volatile var instance: SetupAssistService? = null
            private set

        fun isEnabled(context: android.content.Context): Boolean {
            val target = "${context.packageName}/${SetupAssistService::class.java.name}"
            val enabled = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false
            val splitter = android.text.TextUtils.SimpleStringSplitter(':').apply { setString(enabled) }
            return splitter.any { it.equals(target, ignoreCase = true) }
        }
    }
}
