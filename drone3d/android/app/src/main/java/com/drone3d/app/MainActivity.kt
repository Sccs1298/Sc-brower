package com.drone3d.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import com.drone3d.app.databinding.ActivityMainBinding
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var ui: ActivityMainBinding
    private lateinit var drone: DroneLink
    private lateinit var link: StreamClient
    private val main = Handler(Looper.getMainLooper())
    private var droneStatus = "מאתחל DJI SDK…"
    private var linkStatus = "לא מחובר לשרת"
    private val prefs by lazy { getSharedPreferences("drone3d", Context.MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ui = ActivityMainBinding.inflate(layoutInflater)
        setContentView(ui.root)
        requestPermissions()

        link = StreamClient { s -> linkStatus = s; refreshStatus() }
        drone = DroneLink(this, onStatus = { s -> droneStatus = s; refreshStatus() },
            onFrame = { jpeg, w, h, tm, t -> link.sendFrame(tm.toJson(w, h, t), jpeg) })
        drone.telemetry.hfov = prefs.getFloat("hfov", 73.7f).toDouble()
        drone.targetFps = prefs.getFloat("fps", 4f).toDouble()
        drone.start()

        ui.server.setText(prefs.getString("server", ""))
        ui.model.settings.javaScriptEnabled = true
        ui.model.settings.domStorageEnabled = true
        ui.model.webViewClient = WebViewClient()

        ui.connect.setOnClickListener {
            if (link.connected) {
                link.disconnect()
                ui.connect.setText(R.string.connect)
                return@setOnClickListener
            }
            val host = ui.server.text.toString().trim().removePrefix("http://").trimEnd('/')
            if (host.isEmpty()) return@setOnClickListener
            prefs.edit().putString("server", host).apply()
            link.connect(host)
            ui.model.loadUrl("http://$host/")
            ui.connect.setText(R.string.disconnect)
        }
        ui.stream.setOnCheckedChangeListener { _, on ->
            drone.streaming = on
            ui.stream.setText(if (on) R.string.stream_on else R.string.stream_off)
        }
        ui.reset.setOnClickListener { link.sendCommand("reset") }
        ui.finish.setOnClickListener { post("api/session/finish") }

        ui.video.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {}
            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) =
                drone.startVideo(holder.surface, width, height)
            override fun surfaceDestroyed(holder: SurfaceHolder) = drone.stopVideo(holder.surface)
        })
        tick()
    }

    private fun post(path: String) {
        val host = prefs.getString("server", null) ?: return
        thread {
            runCatching {
                OkHttpClient().newCall(Request.Builder().url("http://$host/$path")
                    .post(ByteArray(0).toRequestBody()).build()).execute().close()
            }
        }
    }

    private fun tick() {
        refreshStatus()
        main.postDelayed({ tick() }, 1000)
    }

    private fun refreshStatus() {
        val t = drone.telemetry
        val gps = if (t.gpsLevel >= 3) "GPS ${t.gpsLevel}" else "ללא GPS (בפנים?)"
        val alt = t.alt?.let { "גובה %.1f מ'".format(it) } ?: ""
        ui.status.text = "$droneStatus  •  $linkStatus  •  נשלחו ${link.sent} (דולגו ${link.skipped})  •  $gps  $alt"
    }

    private fun requestPermissions() {
        val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= 31) perms += listOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), 1)
    }

    override fun onDestroy() {
        link.disconnect()
        drone.stop()
        super.onDestroy()
    }
}
