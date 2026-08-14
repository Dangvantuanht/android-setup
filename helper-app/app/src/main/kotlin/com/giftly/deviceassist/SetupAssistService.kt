package com.giftly.deviceassist

import android.accessibilityservice.AccessibilityService
import android.content.Intent
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

    fun startFlow(kind: String, value: String, onLog: (String) -> Unit, onDone: (Boolean) -> Unit) {
        if (flowThread?.isAlive == true) return
        flowThread = Thread {
            try {
                runFlow(kind, value, onLog)
                onDone(true)
            } catch (t: Throwable) {
                Log.e(TAG, "Flow failed", t)
                onLog("Lỗi: ${t.message}")
                onDone(false)
            }
        }.also { it.start() }
    }

    private fun runFlow(kind: String, value: String, log: (String) -> Unit) {
        log("Đang lấy tài khoản Gmail...")
        val credential = ApiClient.claimGmail(kind, value)
        if (credential == null) {
            log("Không lấy được tài khoản Gmail (hết pool hoặc mã không hợp lệ).")
            return
        }
        log("Đã nhận: ${credential.email}")

        log("Mở Play Store...")
        val launch = packageManager.getLaunchIntentForPackage(PLAY_STORE_PKG)
        if (launch == null) {
            log("Không tìm thấy Play Store trên máy.")
            ApiClient.reportOutcome(kind, value, credential.email, success = false)
            return
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launch)
        waitMs(2_000)

        val loginOk = driveGoogleSignIn(credential, log)
        ApiClient.reportOutcome(kind, value, credential.email, success = loginOk)
        if (!loginOk) {
            log("Đăng nhập Google không thành công — dừng lại, không cài app.")
            return
        }
        log("Đăng nhập thành công.")

        val apps = ApiClient.fetchTargetApps()
        if (apps.isEmpty()) {
            log("Không có app nào trong danh sách cần cài.")
            return
        }
        log("Cài ${apps.size} app: ${apps.joinToString { it.label }}")
        for (app in apps) {
            log("Đang cài ${app.label}...")
            val ok = installApp(app, log)
            log(if (ok) "✓ ${app.label} xong" else "✗ ${app.label} thất bại")
        }
        log("Hoàn tất.")
    }

    // ---- Google sign-in state machine ----------------------------------

    private fun driveGoogleSignIn(credential: GmailCredential, log: (String) -> Unit): Boolean {
        val deadline = SystemClock.elapsedRealtime() + SIGN_IN_TIMEOUT_MS
        var typedEmail = false
        var typedPassword = false

        while (SystemClock.elapsedRealtime() < deadline) {
            val root = rootInActiveWindow
            if (root == null) {
                waitMs(POLL_MS)
                continue
            }

            try {
                // Already signed in / Play Store home reached.
                if (isPlayStoreHome(root)) {
                    return true
                }

                if (!typedEmail) {
                    val emailField = findEditable(root, isPassword = false)
                    if (emailField != null) {
                        setText(emailField, credential.email)
                        log("Đã nhập email")
                        typedEmail = true
                        clickByText(root, NEXT_TEXTS)
                        waitMs(POLL_MS)
                        continue
                    }
                }

                if (typedEmail && !typedPassword) {
                    val pwField = findEditable(root, isPassword = true)
                    if (pwField != null) {
                        setText(pwField, credential.password)
                        log("Đã nhập mật khẩu")
                        typedPassword = true
                        clickByText(root, NEXT_TEXTS)
                        waitMs(POLL_MS)
                        continue
                    }
                }

                // Consent / ToS / "Google Services" / backup prompts — click
                // through any recognized affirmative button, scrolling down
                // first if none is visible yet.
                if (clickByText(root, AFFIRM_TEXTS)) {
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
        log("Hết thời gian chờ đăng nhập Google.")
        return false
    }

    private fun isPlayStoreHome(root: AccessibilityNodeInfo): Boolean {
        val pkg = root.packageName?.toString() ?: return false
        if (pkg != PLAY_STORE_PKG) return false
        return findByViewIdSuffix(root, "search_box") != null ||
            findByText(root, listOf("Apps", "Ứng dụng", "Games", "Trò chơi"), exact = false) != null
    }

    // ---- App install -----------------------------------------------------

    private fun installApp(app: TargetApp, log: (String) -> Unit): Boolean {
        val launch = packageManager.getLaunchIntentForPackage(PLAY_STORE_PKG)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(launch)
        }
        // Deep-link straight to the app's Play Store page — far more reliable
        // than driving the search UI.
        val storeIntent = Intent(Intent.ACTION_VIEW)
        storeIntent.data = android.net.Uri.parse("market://details?id=${app.packageName}")
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
        while (SystemClock.elapsedRealtime() < deadline) {
            val root = rootInActiveWindow
            if (root == null) {
                waitMs(POLL_MS)
                continue
            }
            try {
                if (findByText(root, listOf("Mở", "Open", "Gỡ cài đặt", "Uninstall"), exact = false) != null) {
                    return true // already installed / install finished
                }
                if (!tappedInstall) {
                    tappedInstall = clickByText(root, listOf("Cài đặt", "Install"))
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

    private fun clickByText(root: AccessibilityNodeInfo, candidates: List<String>): Boolean {
        val node = findByText(root, candidates, exact = false) ?: return false
        return try {
            clickNode(node)
        } finally {
            node.recycle()
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

        private val NEXT_TEXTS = listOf("Tiếp theo", "Next", "次へ")
        private val AFFIRM_TEXTS = listOf(
            "Tôi đồng ý", "I agree", "Chấp nhận", "Accept",
            "Không, cảm ơn", "No thanks", "Bỏ qua", "Skip",
            "Tôi hiểu", "I understand", "Tiếp tục", "Continue",
            "Xem thêm", "More", "OK", "Đồng ý",
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
