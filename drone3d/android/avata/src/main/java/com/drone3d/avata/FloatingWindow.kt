package com.drone3d.avata

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader

/**
 * The plugin UI floating over DJI Fly: live 3D model + a small toolbar.
 * Its on-screen rectangle is reported to the engine every frame so it is masked out of the capture.
 */
@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility", "SetTextI18n")
class FloatingWindow(private val ctx: Context, private val calibrating: Boolean, private val onStop: () -> Unit) {
    private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val dp = { v: Int -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), ctx.resources.displayMetrics).toInt() }
    private val root = LinearLayout(ctx)
    private val web = WebView(ctx)
    private val status = TextView(ctx)
    private var large = false
    @Volatile var paused = false
        private set

    private val params = WindowManager.LayoutParams(
        dp(300), dp(220),
        if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START; x = dp(8); y = dp(8) }

    /** Window rectangle in screen pixels (for masking it out of the screen capture). */
    @Volatile var rect = Rect()
        private set

    fun show() {
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundResource(R.drawable.float_bg)
        root.setPadding(dp(4), dp(4), dp(4), dp(4))

        // --- toolbar (also the drag handle)
        val bar = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        fun btn(label: String, onClick: () -> Unit) = Button(ctx, null, android.R.attr.buttonStyleSmall).apply {
            text = label; textSize = 12f; minWidth = 0; minimumWidth = 0; setPadding(dp(8), 0, dp(8), 0)
            setOnClickListener { onClick() }
            bar.addView(this, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(36)))
        }
        status.setTextColor(0xFFE6EDF3.toInt()); status.textSize = 11f
        bar.addView(status, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        if (calibrating) {
            btn("סיים כיול") { finishCalibration() }
        } else {
            lateinit var pauseBtn: Button
            pauseBtn = btn("⏸") { paused = !paused; pauseBtn.text = if (paused) "▶" else "⏸" }
            btn("📏") { toggleHeightRow() }
            btn("⤢") { toggleSize() }
        }
        btn("✕") { onStop() }
        root.addView(bar)
        root.addView(heightRow())

        // --- the 3D viewer, served from app assets (same page as the desktop viewer)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(ctx)).build()
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        web.addJavascriptInterface(JsBridge(ctx), "Drone3D")
        web.loadUrl("https://appassets.androidplatform.net/assets/viewer/index.html?compact=1")
        root.addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        // drag by the toolbar
        var sx = 0f; var sy = 0f; var px = 0; var py = 0
        bar.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { sx = e.rawX; sy = e.rawY; px = params.x; py = params.y; true }
                MotionEvent.ACTION_MOVE -> {
                    params.x = px + (e.rawX - sx).toInt(); params.y = py + (e.rawY - sy).toInt()
                    wm.updateViewLayout(root, params); updateRect(); true
                }
                else -> false
            }
        }
        wm.addView(root, params)
        root.post { updateRect() }
    }

    private lateinit var hRow: LinearLayout
    private fun heightRow(): View {
        hRow = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; visibility = View.GONE }
        val input = EditText(ctx).apply {
            hint = "H מ־DJI Fly (מ')"; textSize = 13f; setTextColor(0xFFE6EDF3.toInt()); setHintTextColor(0xFF8B949E.toInt())
            inputType = EditorInfo.TYPE_CLASS_NUMBER or EditorInfo.TYPE_NUMBER_FLAG_DECIMAL
        }
        val mark = Button(ctx, null, android.R.attr.buttonStyleSmall).apply { text = "סמן גובה"; textSize = 12f }
        val door = Button(ctx, null, android.R.attr.buttonStyleSmall).apply { text = "לפי דלת"; textSize = 12f }
        input.setOnTouchListener { _, _ -> setFocusable(true); false }
        mark.setOnClickListener {
            val h = input.text.toString().toDoubleOrNull() ?: return@setOnClickListener toast("הקלד את H")
            Thread {
                val r = Engine.cmd("mark_height", "meters" to h)
                toast(when {
                    r.has("factor") -> "קנה מידה נקבע ✓"
                    r.optBoolean("pending") -> "נשמר – יוחל כשהמודל יתיישר"
                    r.optBoolean("ok") -> "סימון ראשון נשמר. טפס ישר למעלה ≥1.5 מ' וסמן שוב"
                    else -> "לא הצליח: " + r.optString("reason")
                })
            }.start()
            input.setText(""); setFocusable(false)
        }
        door.setOnClickListener {
            Thread {
                val r = Engine.cmd("scale_door")
                toast(if (r.optBoolean("ok")) "קנה מידה לפי דלת ✓ (משוער)" else "לא הצליח: " + r.optString("reason"))
            }.start()
        }
        hRow.addView(input, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        hRow.addView(mark); hRow.addView(door)
        return hRow
    }

    /** The window must be focusable only while typing, otherwise it would steal DJI Fly's input. */
    private fun setFocusable(on: Boolean) {
        params.flags = if (on) params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
        else params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        wm.updateViewLayout(root, params)
    }

    private fun toggleHeightRow() {
        hRow.visibility = if (hRow.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        if (hRow.visibility == View.GONE) setFocusable(false)
        root.post { updateRect() }
    }

    private fun toggleSize() {
        large = !large
        val m = ctx.resources.displayMetrics
        params.width = if (large) (m.widthPixels * 0.6).toInt() else dp(300)
        params.height = if (large) (m.heightPixels * 0.85).toInt() else dp(220)
        wm.updateViewLayout(root, params)
        web.evaluateJavascript("window.setCompact && window.setCompact(${!large})", null)
        root.post { updateRect() }
    }

    private fun finishCalibration() {
        Thread {
            val r = Engine.cmd("calibrate_finish")
            toast(if (r.optBoolean("ok")) "כיול נשמר ✓ (שגיאה ${r.optDouble("rms")} px)" else "עוד לא: " + r.optString("reason"))
            if (r.optBoolean("ok")) root.post { onStop() }
        }.start()
    }

    fun setStatus(s: String) = root.post { status.text = s }

    private fun updateRect() {
        val loc = IntArray(2)
        root.getLocationOnScreen(loc)
        rect = Rect(loc[0], loc[1], loc[0] + root.width, loc[1] + root.height)
    }

    private fun toast(s: String) {
        root.post { Toast.makeText(ctx, s, Toast.LENGTH_SHORT).show() }
    }

    fun hide() {
        runCatching { wm.removeView(root) }
        web.destroy()
    }
}
