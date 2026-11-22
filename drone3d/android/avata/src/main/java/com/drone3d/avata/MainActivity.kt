package com.drone3d.avata

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import com.drone3d.avata.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {
    private lateinit var ui: ActivityMainBinding
    private val prefs by lazy { getSharedPreferences("drone3d", Context.MODE_PRIVATE) }
    private var calibrate = false

    private val capture = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode != RESULT_OK || r.data == null) {
            toast("צריך לאשר צילום מסך כדי לקרוא את התמונה מ־DJI Fly")
            return@registerForActivityResult
        }
        val i = Intent(this, CaptureService::class.java)
            .putExtra(CaptureService.EXTRA_RESULT_CODE, r.resultCode)
            .putExtra(CaptureService.EXTRA_RESULT_DATA, r.data)
            .putExtra(CaptureService.EXTRA_CALIBRATE, calibrate)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
        openDjiFly()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ui = ActivityMainBinding.inflate(layoutInflater)
        setContentView(ui.root)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)

        when (prefs.getString("drone", "avata2")) {
            "avata1" -> ui.avata1.isChecked = true
            "other" -> ui.other.isChecked = true
            else -> ui.avata2.isChecked = true
        }
        ui.drone.setOnCheckedChangeListener { _, id ->
            prefs.edit().putString("drone", when (id) { R.id.avata1 -> "avata1"; R.id.other -> "other"; else -> "avata2" })
                .apply()
        }
        ui.grant.setOnClickListener {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }
        ui.shareBoard.setOnClickListener { shareChessboard() }
        ui.calibrate.setOnClickListener { begin(calibration = true) }
        ui.start.setOnClickListener {
            if (CaptureService.running) stopService(Intent(this, CaptureService::class.java)) else begin(false)
            refresh()
        }
        ui.fps.value = prefs.getFloat("fps", 3f)
        ui.fps.addOnChangeListener { _, v, _ -> prefs.edit().putFloat("fps", v).apply(); refresh() }
        ui.viewModel.setOnClickListener { showModel(true) }
        ui.shareModel.setOnClickListener { JsBridge.shareModel(this) }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (ui.model.visibility == View.VISIBLE) showModel(false) else finish()
            }
        })
        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        ui.grant.text = if (Settings.canDrawOverlays(this)) "✓ ניתנה הרשאה" else getString(R.string.grant)
        ui.calibState.text = if (File(filesDir, "calibration.json").exists()) "✓ העדשה מכוילת"
        else "לא מכויל – המודל יעבוד, אבל פחות מדויק"
        ui.fpsLabel.text = "${getString(R.string.fps)}: ${ui.fps.value.toInt()}"
        ui.start.text = getString(if (CaptureService.running) R.string.stop else R.string.start)
        ui.engine.text = if (Engine.isReady) "מנוע המידול מוכן ✓ (רץ על הטלפון)" else "טוען את מנוע המידול…"
        if (!Engine.isReady) ui.root.postDelayed({ refresh() }, 1000)
    }

    private fun begin(calibration: Boolean) {
        if (!Settings.canDrawOverlays(this)) {
            toast("קודם צריך לאשר הצגה מעל אפליקציות אחרות (שלב 1)")
            return
        }
        calibrate = calibration
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        capture.launch(mpm.createScreenCaptureIntent())
    }

    private fun openDjiFly() {
        val i = packageManager.getLaunchIntentForPackage("dji.go.v5")
        if (i != null) startActivity(i) else toast("DJI Fly לא נמצאה – פתח אותה ידנית")
    }

    private fun shareChessboard() {
        val f = File(cacheDir, "exports/chessboard_9x6.png")
        f.parentFile?.mkdirs()
        assets.open("chessboard_9x6.png").use { inp -> f.outputStream().use { inp.copyTo(it) } }
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = "image/png"; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, "לוח כיול"))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun showModel(on: Boolean) {
        ui.setup.visibility = if (on) View.GONE else View.VISIBLE
        ui.model.visibility = if (on) View.VISIBLE else View.GONE
        if (on && ui.model.url == null) {
            val loader = WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
            ui.model.settings.javaScriptEnabled = true
            ui.model.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)
            }
            ui.model.addJavascriptInterface(JsBridge(this), "Drone3D")
            ui.model.loadUrl("https://appassets.androidplatform.net/assets/viewer/index.html")
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
