package com.giftly.deviceassist

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var txtStatus: TextView
    private lateinit var txtLog: TextView
    private lateinit var layoutCodeEntry: LinearLayout
    private lateinit var editCode: EditText
    private lateinit var btnSubmitCode: Button
    private lateinit var btnEnableAccessibility: Button
    private lateinit var btnStart: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        txtStatus = findViewById(R.id.txtStatus)
        txtLog = findViewById(R.id.txtLog)
        layoutCodeEntry = findViewById(R.id.layoutCodeEntry)
        editCode = findViewById(R.id.editCode)
        btnSubmitCode = findViewById(R.id.btnSubmitCode)
        btnEnableAccessibility = findViewById(R.id.btnEnableAccessibility)
        btnStart = findViewById(R.id.btnStart)

        // The DPC silently installs + launches this app right after a device
        // finishes QR activation, passing its enrollment token along — see
        // dpc-app's silent-install step. If that's absent, this was opened by
        // hand (manually-activated device), so ask staff to type the short
        // claim code from the dashboard instead.
        intent?.getStringExtra(EXTRA_ENROLLMENT_TOKEN)?.let { token ->
            Prefs.saveIdentity(this, "token", token)
        }

        btnSubmitCode.setOnClickListener {
            val code = editCode.text.toString().trim().uppercase()
            if (code.isBlank()) {
                toast("Nhập mã trước đã")
                return@setOnClickListener
            }
            Prefs.saveIdentity(this, "code", code)
            refresh()
        }

        btnEnableAccessibility.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        btnStart.setOnClickListener { startFlow() }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val identity = Prefs.getIdentity(this)
        val accessibilityOn = SetupAssistService.isEnabled(this)

        layoutCodeEntry.visibility = if (identity == null) android.view.View.VISIBLE else android.view.View.GONE
        btnEnableAccessibility.visibility =
            if (identity != null && !accessibilityOn) android.view.View.VISIBLE else android.view.View.GONE
        btnStart.visibility =
            if (identity != null && accessibilityOn && !Prefs.isSetupDone(this)) android.view.View.VISIBLE
            else android.view.View.GONE

        txtStatus.text = when {
            identity == null -> "Chưa có mã kích hoạt — nhập mã bên dưới."
            !accessibilityOn -> "Cần bật Trợ năng để tiếp tục."
            Prefs.isSetupDone(this) -> "Đã hoàn tất thiết lập."
            else -> "Sẵn sàng — bấm Bắt đầu."
        }
    }

    private fun startFlow() {
        val identity = Prefs.getIdentity(this) ?: return
        val service = SetupAssistService.instance
        if (service == null) {
            toast("Trợ năng chưa kết nối — tắt/bật lại trong Cài đặt rồi thử lại.")
            return
        }
        btnStart.isEnabled = false
        txtLog.text = ""
        service.startFlow(
            identity.first,
            identity.second,
            onLog = { line -> runOnUiThread { appendLog(line) } },
            onDone = { success ->
                runOnUiThread {
                    btnStart.isEnabled = true
                    if (success) Prefs.setSetupDone(this, true)
                    refresh()
                }
            },
        )
    }

    private fun appendLog(line: String) {
        txtLog.text = "${txtLog.text}\n$line".trim()
    }

    private fun toast(msg: String) = android.widget.Toast.makeText(this, msg, android.widget.Toast.LENGTH_SHORT).show()

    companion object {
        const val EXTRA_ENROLLMENT_TOKEN = "enrollment_token"
    }
}
