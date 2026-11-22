package com.drone3d.avata

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** `window.Drone3D` inside the viewer page (server/viewer/index.html, bridge mode). */
class JsBridge(private val ctx: Context) {
    @JavascriptInterface
    fun poll(max: Int): String = Engine.poll(max)

    @JavascriptInterface
    fun command(json: String): String = Engine.command(json)

    @JavascriptInterface
    fun snapshot() = Engine.snapshot()

    @JavascriptInterface
    fun share() = shareModel(ctx)

    companion object {
        fun shareModel(ctx: Context) {
            Thread {
                val name = "drone3d_" + SimpleDateFormat("yyyyMMdd_HHmm", Locale.US).format(Date()) + ".ply"
                val f = Engine.exportPly(File(ctx.cacheDir, "exports/$name"))
                Engine.command("{\"cmd\": \"finish\"}")   // also saves structure.json / transforms.json
                val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "application/octet-stream"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                ctx.startActivity(Intent.createChooser(send, "Drone3D").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }.start()
        }
    }
}
