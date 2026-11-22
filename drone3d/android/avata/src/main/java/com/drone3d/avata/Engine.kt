package com.drone3d.avata

import android.content.Context
import android.util.Log
import com.chaquo.python.PyObject
import com.chaquo.python.Python
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The Python reconstruction engine (server/drone3d, shared with the desktop server) running on the phone.
 * Frames are processed on one worker thread; while it is busy, new frames are dropped (live, not a queue).
 */
object Engine {
    private const val TAG = "Drone3D"
    private val worker = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(false)
    private val ready = CountDownLatch(1)
    private lateinit var mod: PyObject
    lateinit var filesDir: File
        private set
    @Volatile var processed = 0
        private set
    @Volatile var dropped = 0
        private set
    @Volatile var lastFrameMs = 0L
        private set

    fun start(ctx: Context, config: JSONObject = JSONObject()) {
        filesDir = ctx.filesDir
        worker.execute {
            // importing numpy / OpenCV takes a few seconds the first time
            mod = Python.getInstance().getModule("drone3d.mobile")
            mod.callAttr("init", filesDir.absolutePath, config.toString())
            ready.countDown()
            Log.i(TAG, "engine ready")
        }
    }

    val isReady get() = ready.count == 0L

    /** Returns false if the frame was dropped because the engine is still busy with the previous one. */
    fun submitRgba(buf: ByteArray, width: Int, height: Int, rowStride: Int, telemetry: JSONObject): Boolean {
        if (!isReady || !busy.compareAndSet(false, true)) {
            dropped++
            return false
        }
        worker.execute {
            val t0 = System.currentTimeMillis()
            try {
                mod.callAttr("process_rgba", buf, width, height, rowStride, telemetry.toString())
                processed++
            } catch (t: Throwable) {
                Log.e(TAG, "process failed", t)
            } finally {
                lastFrameMs = System.currentTimeMillis() - t0
                busy.set(false)
            }
        }
        return true
    }

    fun poll(max: Int): String = if (isReady) mod.callAttr("poll", max).toString() else "[]"

    fun snapshot() {
        if (isReady) mod.callAttr("snapshot")
    }

    /** Commands are run on the worker thread too, so they never race a frame being processed. */
    fun command(json: String): String {
        ready.await()
        return worker.submit<String> { mod.callAttr("command", json).toString() }.get()
    }

    /** Convenience: Engine.cmd("mark_height", "meters" to 3.5) -> parsed reply. */
    fun cmd(cmd: String, vararg kv: Pair<String, Any>): JSONObject {
        val o = JSONObject().put("cmd", cmd)
        kv.forEach { (k, v) -> o.put(k, v) }
        return JSONObject(command(o.toString()))
    }

    fun exportPly(dest: File): File {
        ready.await()
        dest.parentFile?.mkdirs()
        worker.submit<String> { mod.callAttr("export_ply", dest.absolutePath).toString() }.get()
        return dest
    }
}
