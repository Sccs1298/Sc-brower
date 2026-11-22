package com.drone3d.avata

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import org.json.JSONArray
import org.json.JSONObject

/**
 * Captures the phone screen while DJI Fly shows the drone's live view (Avata 1/2 via the goggles),
 * feeds the frames to the on-phone engine and hosts the floating model window.
 */
class CaptureService : Service() {
    companion object {
        const val EXTRA_RESULT_CODE = "code"
        const val EXTRA_RESULT_DATA = "data"
        const val EXTRA_CALIBRATE = "calibrate"
        private const val CHANNEL = "drone3d"
        @Volatile var running = false
            private set
    }

    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var overlay: FloatingWindow? = null
    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private val main = Handler(Looper.getMainLooper())
    private var lastFrame = 0L
    private var screenW = 0
    private var screenH = 0
    private var calibrating = false
    private val heightReader = HeightReader()
    private val prefs by lazy { getSharedPreferences("drone3d", Context.MODE_PRIVATE) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null || running) return START_NOT_STICKY
        startAsForeground()
        val code = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
        @Suppress("DEPRECATION")
        val data: Intent = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        else intent.getParcelableExtra(EXTRA_RESULT_DATA)) ?: return START_NOT_STICKY.also { stopSelf() }
        calibrating = intent.getBooleanExtra(EXTRA_CALIBRATE, false)

        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = mpm.getMediaProjection(code, data).apply {
            registerCallback(object : MediaProjection.Callback() {
                override fun onStop() = main.post { stopSelf() }.let { }
            }, main)
        }
        thread = HandlerThread("capture").also { it.start() }
        handler = Handler(thread.looper)
        running = true

        Thread {
            Engine.cmd(if (calibrating) "calibrate_start" else "reset")
        }.start()
        overlay = FloatingWindow(this, calibrating) { stopSelf() }.also { it.show() }
        createDisplay()
        registerComponentCallbacks(rotationWatcher)
        return START_NOT_STICKY
    }

    // ------------------------------------------------------------- capture
    private fun screenSize(): Pair<Int, Int> {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= 30) {
            val b = wm.currentWindowMetrics.bounds
            b.width() to b.height()
        } else {
            val m = DisplayMetrics()
            @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m)
            m.widthPixels to m.heightPixels
        }
    }

    private fun createDisplay() {
        val (sw, sh) = screenSize()
        screenW = sw; screenH = sh
        // capture at a reduced resolution: the engine works at <= 640 px wide anyway
        val maxW = prefs.getInt("capture_width", 960)
        val scale = minOf(1f, maxW.toFloat() / maxOf(sw, sh))
        val w = (sw * scale).toInt() / 2 * 2
        val h = (sh * scale).toInt() / 2 * 2
        display?.release()
        reader?.close()
        reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2).apply {
            setOnImageAvailableListener({ onImage(it) }, handler)
        }
        display = projection?.createVirtualDisplay("drone3d", w, h, resources.displayMetrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader!!.surface, null, handler)
    }

    private val rotationWatcher = object : ComponentCallbacks {
        override fun onConfigurationChanged(newConfig: Configuration) {
            val (sw, sh) = screenSize()
            if (sw != screenW || sh != screenH) handler.post { createDisplay() }
        }

        @Deprecated("") override fun onLowMemory() {}
    }

    private fun onImage(r: ImageReader) {
        val img = r.acquireLatestImage() ?: return
        try {
            val now = System.currentTimeMillis()
            val fps = prefs.getFloat("fps", 3f)
            if (overlay?.paused == true || now - lastFrame < 1000f / fps) return
            val plane = img.planes[0]
            val buf = plane.buffer
            val bytes = ByteArray(buf.remaining())
            buf.get(bytes)
            val tm = JSONObject().put("t", now).put("hfov", prefs.getFloat("hfov", 100f).toDouble())
            // our own floating window is in the capture: mask it out (fractions of the screen)
            overlay?.rect?.let { rc ->
                if (!rc.isEmpty) tm.put("mask", JSONArray().put(JSONArray(listOf(
                    rc.left.toDouble() / screenW, rc.top.toDouble() / screenH,
                    rc.width().toDouble() / screenW, rc.height().toDouble() / screenH))))
            }
            cropFractions()?.let { tm.put("crop", it) }
            // the height H printed by DJI Fly -> metric scale (OCR, ~1x per second)
            if (!calibrating && prefs.getBoolean("ocr_height", true)) {
                heightReader.maybeRead(bytes, img.width, img.height, plane.rowStride, now)
                heightReader.current(now)?.let { tm.put("alt_osd", it) }
            }
            if (Engine.submitRgba(bytes, img.width, img.height, plane.rowStride, tm)) lastFrame = now
            overlay?.setStatus(status())
        } finally {
            img.close()
        }
    }

    /** Optional user crop of the DJI Fly screen [left, top, right, bottom] (fractions trimmed). */
    private fun cropFractions(): JSONArray? {
        val s = prefs.getString("crop", null) ?: return null
        val v = s.split(",").mapNotNull { it.trim().toDoubleOrNull() }
        return if (v.size == 4) JSONArray(v) else null
    }

    private fun status(): String {
        if (!Engine.isReady) return "טוען מנוע…"
        if (calibrating) return "כיול: כוון אל הלוח"
        val h = heightReader.current()?.let { "H=%.1f".format(it) } ?: "H לא נקרא"
        return "עובדו ${Engine.processed} · ${Engine.lastFrameMs}ms · $h"
    }

    // ---------------------------------------------------------- lifecycle
    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.notif_channel),
                NotificationManager.IMPORTANCE_LOW))
        }
        val n: Notification = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL)
        else @Suppress("DEPRECATION") Notification.Builder(this))
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(1, n)
    }

    override fun onDestroy() {
        running = false
        runCatching { unregisterComponentCallbacks(rotationWatcher) }
        overlay?.hide()
        display?.release()
        reader?.close()
        projection?.stop()
        if (::thread.isInitialized) thread.quitSafely()
        if (calibrating) Thread { runCatching { Engine.cmd("calibrate_cancel") } }.start()
        super.onDestroy()
    }
}
