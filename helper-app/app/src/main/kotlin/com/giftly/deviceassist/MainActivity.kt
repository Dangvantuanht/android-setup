package com.giftly.deviceassist

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var txtStatus: TextView
    private lateinit var txtLog: TextView
    private lateinit var rowCode: View
    private lateinit var txtCodeState: TextView
    private lateinit var layoutCodeEntry: LinearLayout
    private lateinit var editCode: EditText
    private lateinit var btnSubmitCode: Button
    private lateinit var rowAccessibility: View
    private lateinit var switchAccessibility: Switch
    private lateinit var txtAccessibilityState: TextView
    private lateinit var rowBattery: View
    private lateinit var switchBattery: Switch
    private lateinit var txtBatteryState: TextView
    private lateinit var txtAppsHeader: TextView
    private lateinit var layoutApps: LinearLayout
    private lateinit var btnStart: Button
    private lateinit var btnStop: Button

    // Người dùng có thể bấm dòng "Mã kích hoạt" để mở lại ô nhập bất cứ lúc
    // nào (kể cả đã có mã, để đổi mã) — không chỉ tự động hiện khi thiếu mã.
    private var codeEntryExpanded = false

    // Danh sách app + trạng thái tick vẫn lấy từ server (label/package có thể
    // đổi theo khu vực mà không cần build lại APK), nhưng CÀI HAY KHÔNG là do
    // người cầm máy tự chọn ngay trên màn hình này cho từng lần chạy.
    private var availableApps: List<TargetApp> = emptyList()
    private val appCheckBoxes = mutableMapOf<String, CheckBox>()

    private fun isIgnoringBatteryOptimizations(): Boolean {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        txtStatus = findViewById(R.id.txtStatus)
        txtLog = findViewById(R.id.txtLog)
        rowCode = findViewById(R.id.rowCode)
        txtCodeState = findViewById(R.id.txtCodeState)
        layoutCodeEntry = findViewById(R.id.layoutCodeEntry)
        editCode = findViewById(R.id.editCode)
        btnSubmitCode = findViewById(R.id.btnSubmitCode)
        rowAccessibility = findViewById(R.id.rowAccessibility)
        switchAccessibility = findViewById(R.id.switchAccessibility)
        txtAccessibilityState = findViewById(R.id.txtAccessibilityState)
        rowBattery = findViewById(R.id.rowBattery)
        switchBattery = findViewById(R.id.switchBattery)
        txtBatteryState = findViewById(R.id.txtBatteryState)
        txtAppsHeader = findViewById(R.id.txtAppsHeader)
        layoutApps = findViewById(R.id.layoutApps)
        btnStart = findViewById(R.id.btnStart)
        btnStop = findViewById(R.id.btnStop)
        // Chỉ hiển thị trạng thái — Android không cho app tự bật/tắt các quyền
        // này ngoài hộp thoại hệ thống. Tắt tương tác trên switch để thao tác
        // chạm luôn nổi lên đúng OnClickListener của cả dòng.
        switchAccessibility.isEnabled = false
        switchBattery.isEnabled = false

        // The DPC silently installs + launches this app right after a device
        // finishes QR activation, passing its enrollment token along — see
        // dpc-app's silent-install step.
        intent?.getStringExtra(EXTRA_ENROLLMENT_TOKEN)?.let { token ->
            Prefs.saveIdentity(this, "token", token)
        }

        // Fallback for QR-activated devices: if the auto-launch above didn't
        // happen to actually deliver the token this time (confirmed live —
        // a Knox install-confirmation dialog can interrupt DPC's silent
        // install+launch, so staff end up opening this app by hand from the
        // launcher with no extra attached), ask the DPC directly over a
        // same-device broadcast instead of falling back straight to manual
        // code entry. Harmless no-op on a manually-activated device (DPC
        // isn't installed there, so nothing answers).
        if (Prefs.getIdentity(this) == null) {
            sendBroadcast(Intent(ACTION_QUERY_TOKEN).setPackage(DPC_PACKAGE))
            // The reply lands in TokenReplyReceiver asynchronously and just
            // writes to shared Prefs — re-check shortly after so the UI
            // picks it up without staff having to background/reopen the app.
            android.os.Handler(mainLooper).postDelayed({ refresh() }, 1_500)
        }

        rowCode.setOnClickListener {
            codeEntryExpanded = !codeEntryExpanded
            refresh()
        }

        btnSubmitCode.setOnClickListener {
            val code = editCode.text.toString().trim().uppercase()
            if (code.isBlank()) {
                toast("Nhập mã trước đã")
                return@setOnClickListener
            }
            Prefs.saveIdentity(this, "code", code)
            codeEntryExpanded = false
            refresh()
        }

        rowAccessibility.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        rowBattery.setOnClickListener {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        }

        btnStart.setOnClickListener { onStartClicked() }
        btnStop.setOnClickListener {
            SetupAssistService.instance?.cancelFlow()
            btnStop.isEnabled = false
        }

        loadTargetApps()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun loadTargetApps() {
        Thread {
            val apps = ApiClient.fetchTargetApps()
            runOnUiThread {
                availableApps = apps
                populateAppCheckboxes(apps)
            }
        }.start()
    }

    private fun populateAppCheckboxes(apps: List<TargetApp>) {
        layoutApps.removeAllViews()
        appCheckBoxes.clear()
        txtAppsHeader.visibility = if (apps.isEmpty()) View.GONE else View.VISIBLE
        for (app in apps) {
            val cb = CheckBox(this).apply {
                text = app.label
                isChecked = true
                textSize = 14f
            }
            appCheckBoxes[app.packageName] = cb
            layoutApps.addView(cb)
        }
    }

    // Nhãn "ĐANG BẬT"/"CẦN BẬT" đi kèm công tắc, không phụ thuộc màu mặc định
    // của Android khi switch bị disable (luôn xám bất kể trạng thái) — tự tô
    // màu thumb/track theo đúng trạng thái thật.
    private fun setStateLabel(txt: TextView, sw: Switch, ok: Boolean) {
        txt.text = if (ok) "ĐANG BẬT" else "CẦN BẬT"
        val color = Color.parseColor(if (ok) "#22c55e" else "#ef4444")
        txt.setTextColor(color)
        val tint = android.content.res.ColorStateList.valueOf(color)
        sw.thumbTintList = tint
        sw.trackTintList = tint
        sw.isChecked = ok
    }

    private fun refresh() {
        val identity = Prefs.getIdentity(this)
        val hasCode = identity != null
        val accessibilityOn = SetupAssistService.isEnabled(this)
        // A plain background Thread (no foreground service, no wakelock) gets
        // frozen by Doze once the screen locks — confirmed live: the sign-in
        // click loop stalled indefinitely until the app was added to the
        // battery-optimization whitelist.
        val batteryOk = isIgnoringBatteryOptimizations()
        val running = SetupAssistService.instance?.isFlowRunning == true

        txtCodeState.text = if (hasCode) "ĐÃ NHẬP" else "CHƯA NHẬP"
        txtCodeState.setTextColor(Color.parseColor(if (hasCode) "#22c55e" else "#ef4444"))
        layoutCodeEntry.visibility = if (!hasCode || codeEntryExpanded) View.VISIBLE else View.GONE

        setStateLabel(txtAccessibilityState, switchAccessibility, accessibilityOn)
        setStateLabel(txtBatteryState, switchBattery, batteryOk)

        btnStart.visibility = if (running) View.GONE else View.VISIBLE
        btnStart.isEnabled = !Prefs.isSetupDone(this)
        btnStop.visibility = if (running) View.VISIBLE else View.GONE
        btnStop.isEnabled = true

        txtStatus.text = when {
            running -> "Đang chạy — bấm Dừng nếu cần huỷ."
            Prefs.isSetupDone(this) -> "Đã hoàn tất thiết lập."
            !hasCode -> "Thiếu mã kích hoạt."
            !accessibilityOn -> "Thiếu quyền Trợ năng."
            !batteryOk -> "Thiếu quyền không giới hạn pin."
            else -> "Sẵn sàng — bấm Bắt đầu."
        }
    }

    // Bắt đầu luôn bấm được — thiếu bước nào thì báo đúng bước đó và mở sẵn
    // chỗ cần làm, thay vì ẩn nút đi khiến người dùng không biết phải làm gì.
    private fun onStartClicked() {
        val identity = Prefs.getIdentity(this)
        if (identity == null) {
            toast("Chưa có mã kích hoạt")
            codeEntryExpanded = true
            refresh()
            return
        }
        if (!SetupAssistService.isEnabled(this)) {
            toast("Cần bật quyền Trợ năng trước")
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            return
        }
        if (!isIgnoringBatteryOptimizations()) {
            toast("Cần tắt tối ưu pin trước")
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            return
        }
        val service = SetupAssistService.instance
        if (service == null) {
            toast("Trợ năng chưa kết nối — tắt/bật lại trong Cài đặt rồi thử lại.")
            return
        }
        val selectedApps = availableApps.filter { appCheckBoxes[it.packageName]?.isChecked == true }
        txtLog.text = ""
        refresh()
        service.startFlow(
            identity.first,
            identity.second,
            selectedApps,
            onLog = { line ->
                runOnUiThread { appendLog(line) }
                ApiClient.sendLog(identity.first, identity.second, line)
            },
            onDone = { outcome ->
                runOnUiThread {
                    when (outcome) {
                        FlowOutcome.SUCCESS -> {
                            Prefs.setSetupDone(this, true)
                            // Staff don't need to sit looking at the log
                            // screen once everything's done — hand the
                            // device back to Home automatically. Short
                            // delay so the final "Hoàn tất" log line is
                            // still visible for a moment first.
                            android.os.Handler(mainLooper).postDelayed({
                                moveTaskToBack(true)
                            }, 1_500)
                        }
                        FlowOutcome.NEEDS_NEW_CODE -> {
                            // The saved code is dead server-side (expired/
                            // revoked/unknown) — clear it and pop the entry
                            // field open instead of leaving staff to wonder
                            // why "ĐÃ NHẬP" still shows for a code that can
                            // never succeed again.
                            Prefs.clearIdentity(this)
                            codeEntryExpanded = true
                            toast("Mã kích hoạt không dùng được nữa — nhập mã mới.")
                        }
                        FlowOutcome.FAILED -> {}
                    }
                    refresh()
                }
            },
        )
        refresh()
    }

    private fun appendLog(line: String) {
        // Also mirrored to logcat (see below) — this TextView alone isn't
        // enough to debug a run after the fact, since it's wiped on the next
        // run and isn't visible unless someone is staring at the screen at
        // the exact moment.
        txtLog.text = "${txtLog.text}\n$line".trim()
        android.util.Log.i("DeviceAssist", line)
    }

    private fun toast(msg: String) = android.widget.Toast.makeText(this, msg, android.widget.Toast.LENGTH_SHORT).show()

    companion object {
        const val EXTRA_ENROLLMENT_TOKEN = "enrollment_token"
        private const val DPC_PACKAGE = "com.autosetup.dpc"
        // Matches TokenQueryReceiver.ACTION_QUERY_TOKEN in the DPC app.
        private const val ACTION_QUERY_TOKEN = "com.autosetup.dpc.action.QUERY_HELPER_TOKEN"
    }
}
